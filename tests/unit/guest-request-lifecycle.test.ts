import { describe, expect, it, vi } from "vitest";
import { createGuestRequestRepository } from "../../apps/worker/src/modules/requests/infrastructure/guest-request-d1-repository";
import { joinPartyGuest, submitGuestTrackRequest } from "../../apps/worker/src/modules/requests/application/guest-request-lifecycle";

function fakeDb(options: {
  event?: unknown; guest?: unknown; settings?: Array<{key:string;value:string}>;
  count?: number; duplicate?: unknown;
} = {}) {
  const calls: Array<{sql:string;values:unknown[]}> = [];
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) { values=args; return statement; },
        async first() {
          calls.push({sql,values:[...values]});
          if (sql.includes("FROM events")) return options.event === undefined ? {id:"event-1"} : options.event;
          if (sql.includes("FROM guests")) return options.guest === undefined ? {id:"guest-1"} : options.guest;
          if (sql.includes("COUNT(*)")) return {count:options.count ?? 0};
          if (sql.includes("FROM requests") && sql.includes("spotify_track_id")) return options.duplicate ?? null;
          return null;
        },
        async all() { calls.push({sql,values:[...values]}); return {results:options.settings ?? []}; },
        async run() { calls.push({sql,values:[...values]}); return {meta:{changes:1}}; },
      };
      return statement;
    },
  };
  return {db:db as never,calls};
}

const spotifyTrack = {
  id:"1234567890123456789012", uri:"spotify:track:1234567890123456789012",
  name:"Test Song", artists:[{name:"Artist A"},{name:"Artist B"}],
  album:{images:[{url:"https://image.example/large"},{url:"https://image.example/medium"}]},
  duration_ms:210000,
};

describe("guest request lifecycle", () => {
  it("creates a guest and issues a 12-hour event-scoped session", async () => {
    const {db,calls}=fakeDb();
    const createToken=vi.fn(async () => "signed-session");
    const result=await joinPartyGuest({
      repository:createGuestRequestRepository(db),eventId:"event-1",nickname:"Koen",eventCode:"party-code",
      expectedCodeHash:"hash",sessionSecret:"secret",
      hashCode:async value => value==="party-code"?"hash":"wrong",
      createToken,createId:()=>"guest-new",nowSeconds:()=>1000,
    });
    expect(result).toEqual({status:201,body:{
      ok:true,guest:{id:"guest-new",nickname:"Koen"},sessionToken:"signed-session",expiresAt:44200,
    }});
    expect(calls.some(call=>call.sql.startsWith("INSERT INTO guests"))).toBe(true);
    expect(createToken).toHaveBeenCalledWith({sub:"guest-new",eventId:"event-1",nickname:"Koen",exp:44200},"secret");
  });

  it("rejects an incorrect event code before touching the database", async () => {
    const {db,calls}=fakeDb();
    const result=await joinPartyGuest({
      repository:createGuestRequestRepository(db),eventId:"event-1",nickname:"Koen",eventCode:"wrong",
      expectedCodeHash:"hash",sessionSecret:"secret",hashCode:async()=>"nope",
      createToken:async()=>"token",createId:()=>"guest",nowSeconds:()=>100,
    });
    expect(result).toMatchObject({status:401});
    expect(calls).toHaveLength(0);
  });

  it("enforces event-scoped guest, pause, hourly limit and duplicate checks", async () => {
    const missing=fakeDb({guest:null});
    expect(await submitGuestTrackRequest({
      db:missing.db,eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request",trackGateway:{getTrack:vi.fn()},
    })).toMatchObject({status:401});

    const paused=fakeDb({settings:[{key:"requests_paused",value:"true"}]});
    expect(await submitGuestTrackRequest({
      db:paused.db,eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request",trackGateway:{getTrack:vi.fn()},
    })).toMatchObject({status:403});

    const limited=fakeDb({count:20});
    expect(await submitGuestTrackRequest({
      db:limited.db,eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request",trackGateway:{getTrack:vi.fn()},
    })).toMatchObject({status:429});

    const duplicate=fakeDb({duplicate:{id:"existing"}});
    expect(await submitGuestTrackRequest({
      db:duplicate.db,eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request",trackGateway:{getTrack:vi.fn()},
    })).toMatchObject({status:409});
  });

  it("verifies the Spotify track and applies auto-approve/auto-queue policy", async () => {
    const {db,calls}=fakeDb({settings:[
      {key:"auto_approve",value:"true"},{key:"auto_queue",value:"true"},
    ]});
    const result=await submitGuestTrackRequest({
      repository:createGuestRequestRepository(db),eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request-new",trackGateway:{getTrack:vi.fn(async()=>spotifyTrack)},
    });
    expect(result).toEqual({status:201,body:{
      ok:true,request:{id:"request-new",name:"Test Song",artists:["Artist A","Artist B"],status:"queued"},
    }});
    const insert=calls.find(call=>call.sql.startsWith("INSERT INTO requests"));
    expect(insert?.values).toContain("queued");
    expect(insert?.values).toContain("Artist A, Artist B");
    expect(insert?.values).toContain("https://image.example/medium");
  });

  it("does not insert when Spotify no longer returns the selected track", async () => {
    const {db,calls}=fakeDb();
    const result=await submitGuestTrackRequest({
      repository:createGuestRequestRepository(db),eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request",trackGateway:{getTrack:async()=>null},
    });
    expect(result).toMatchObject({status:400});
    expect(calls.some(call=>call.sql.startsWith("INSERT INTO requests"))).toBe(false);
  });
});
