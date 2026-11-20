import { describe, expect, it, vi } from "vitest";
import {
  addDjTrackToPartyQueue,
  moderatePartyRequest,
  queueApprovedPartyRequest,
} from "../../apps/worker/src/modules/requests/application/guest-request-lifecycle";

function fakeDb(options:{
  current?:{id:string;status:string}|null;
  duplicate?:{id:string;status:string}|null;
  autoQueue?:string;
  savedOrder?:string;
  updateChanges?:number;
}={}){
  const calls:Array<{sql:string;values:unknown[]}>= [];
  const db={
    prepare(sql:string){
      let values:unknown[]=[];
      const statement={
        bind(...args:unknown[]){values=args;return statement;},
        async first(){
          calls.push({sql,values:[...values]});
          if(sql.includes("spotify_track_id"))return options.duplicate??null;
          if(sql.includes("SELECT id,status FROM requests"))return options.current===undefined?{id:"req-1",status:"pending"}:options.current;
          if(sql.includes("SELECT value FROM settings WHERE key = ?"))return {value:options.autoQueue??"false"};
          if(sql.includes("SELECT value FROM settings WHERE key='partyqueue_order'"))return {value:options.savedOrder??'["old"]'};
          return null;
        },
        async run(){
          calls.push({sql,values:[...values]});
          return {meta:{changes:options.updateChanges??1}};
        },
      };
      return statement;
    },
  };
  return {db:db as never,calls};
}

const track={
  id:"1234567890123456789012",uri:"spotify:track:1234567890123456789012",
  name:"AI selected song",artists:[{name:"Artist"}],
  album:{images:[{url:"https://image.example/large"},{url:"https://image.example/small"}]},
  duration_ms:180000,
};

describe("DJ request lifecycle",()=>{
  it("approves a pending request and honors auto-queue",async()=>{
    const {db,calls}=fakeDb({autoQueue:"true"});
    const result=await moderatePartyRequest({db,eventId:"event-1",requestId:"req-1",action:"approve"});
    expect(result).toEqual({status:200,body:{ok:true,status:"queued"}});
    const update=calls.find(call=>call.sql.startsWith("UPDATE requests"));
    expect(update?.sql).toContain("queued_at = CURRENT_TIMESTAMP");
    expect(update?.values).toEqual(["queued","req-1","event-1"]);
  });

  it("rejects invalid state transitions and unknown actions",async()=>{
    const {db}=fakeDb({current:{id:"req-1",status:"played"}});
    expect(await moderatePartyRequest({db,eventId:"event-1",requestId:"req-1",action:"approve"}))
      .toMatchObject({status:409});
    expect(await moderatePartyRequest({db,eventId:"event-1",requestId:"req-1",action:"unknown"}))
      .toMatchObject({status:409});
  });

  it("returns not found for requests outside the event",async()=>{
    const {db}=fakeDb({current:null});
    expect(await moderatePartyRequest({db,eventId:"event-1",requestId:"missing",action:"reject"}))
      .toMatchObject({status:404});
  });

  it("queues an approved request with a conditional state update",async()=>{
    const {db,calls}=fakeDb({current:{id:"req-1",status:"approved"}});
    const result=await queueApprovedPartyRequest({db,eventId:"event-1",requestId:"req-1"});
    expect(result).toEqual({status:200,body:{ok:true,status:"queued"}});
    expect(calls.some(call=>call.sql.includes("status='queued'")&&call.sql.includes("status='approved'"))).toBe(true);
  });

  it("does not add a duplicate DJ track",async()=>{
    const {db,calls}=fakeDb({duplicate:{id:"existing",status:"queued"}});
    const getTrack=vi.fn();
    const result=await addDjTrackToPartyQueue({
      db,eventId:"event-1",trackId:track.id,createId:()=>"new-request",trackGateway:{getTrack},
    });
    expect(result).toEqual({status:200,body:{ok:true,alreadyQueued:true,status:"queued"}});
    expect(getTrack).not.toHaveBeenCalled();
    expect(calls.some(call=>call.sql.startsWith("INSERT INTO requests"))).toBe(false);
  });

  it("creates a DJ guest, queues the selected track and appends its ID to saved order",async()=>{
    const {db,calls}=fakeDb({savedOrder:'["old","stale"]'});
    const result=await addDjTrackToPartyQueue({
      db,eventId:"event-1",trackId:track.id,createId:()=>"new-request",
      trackGateway:{getTrack:async()=>track},
    });
    expect(result).toEqual({status:201,body:{ok:true,request:{
      id:"new-request",name:"AI selected song",artist:"Artist",status:"queued",
    }}});
    expect(calls.some(call=>call.sql.startsWith("INSERT OR IGNORE INTO guests"))).toBe(true);
    const insert=calls.find(call=>call.sql.startsWith("INSERT INTO requests"));
    expect(insert?.values).toContain("queued");
    expect(insert?.values).toContain("Artist");
    const orderWrite=calls.find(call=>call.sql.includes("partyqueue_order")&&call.sql.startsWith("INSERT INTO settings"));
    expect(JSON.parse(orderWrite?.values[0] as string)).toEqual(["old","stale","new-request"]);
  });

  it("returns Spotify errors without inserting a DJ request",async()=>{
    const {db,calls}=fakeDb();
    const result=await addDjTrackToPartyQueue({
      db,eventId:"event-1",trackId:track.id,createId:()=>"new-request",
      trackGateway:{getTrack:async()=>null},
    });
    expect(result).toMatchObject({status:502});
    expect(calls.some(call=>call.sql.startsWith("INSERT INTO requests"))).toBe(false);
  });
});
