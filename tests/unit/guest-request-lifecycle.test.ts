import { describe, expect, it, vi } from "vitest";
import { createGuestRequestRepository } from "../../apps/worker/src/modules/requests/infrastructure/guest-request-d1-repository";
import { joinPartyGuest, submitGuestTrackRequest } from "../../apps/worker/src/modules/requests/application/guest-request-lifecycle";

function fakeDb(options: {
  event?: unknown; guest?: unknown; settings?: Array<{key:string;value:string}>;
  count?: number; countAfterInsert?: number;
  duplicate?: unknown; insertChanges?: number;
} = {}) {
  const calls: Array<{sql:string;values:unknown[]}> = [];
  let insertAttempted = false;
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) { values=args; return statement; },
        async first() {
          calls.push({sql,values:[...values]});
          if (sql.includes("FROM events")) return options.event === undefined ? {id:"event-1"} : options.event;
          if (sql.includes("FROM guests")) return options.guest === undefined ? {id:"guest-1"} : options.guest;
          if (sql.includes("COUNT(*)")) return {count:insertAttempted ? (options.countAfterInsert ?? options.count ?? 0) : (options.count ?? 0)};
          if (sql.includes("FROM requests") && sql.includes("spotify_track_id")) return options.duplicate ?? null;
          return null;
        },
        async all() { calls.push({sql,values:[...values]}); return {results:options.settings ?? []}; },
        async run() { calls.push({sql,values:[...values]}); if (sql.includes("INTO requests")) insertAttempted = true; return {meta:{changes:sql.includes("INTO requests") ? (options.insertChanges ?? 1) : 1}}; },
      };
      return statement;
    },
  };
  return {db:db as never,calls};
}

const spotifyTrack = {
  id:"1234567890123456789012", uri:"spotify:track:1234567890123456789012",
  name:"Test Song", artists:["Artist A","Artist B"],
  albumImageUrl:"https://image.example/medium",
  durationMs:210000,
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
    expect(result).toEqual({ok:true,value:{
      guest:{id:"guest-new",nickname:"Koen"},sessionToken:"signed-session",expiresAt:44200,
    }});
    expect(calls.some(call=>call.sql.startsWith("INSERT INTO guests"))).toBe(true);
    expect(createToken).toHaveBeenCalledWith({sub:"guest-new",eventId:"event-1",nickname:"Koen",exp:44200},"secret");
  });

  it("does not persist a guest when session signing fails", async () => {
    const {db,calls}=fakeDb();
    await expect(joinPartyGuest({
      repository:createGuestRequestRepository(db),eventId:"event-1",nickname:"Koen",eventCode:"party-code",
      expectedCodeHash:"hash",sessionSecret:"secret",hashCode:async()=>"hash",
      createToken:async()=>{throw new Error("signing unavailable");},createId:()=>"guest-new",nowSeconds:()=>1000,
    })).rejects.toThrow("signing unavailable");
    expect(calls.some(call=>call.sql.startsWith("INSERT INTO guests"))).toBe(false);
  });

  it("rejects an incorrect event code before touching the database", async () => {
    const {db,calls}=fakeDb();
    const result=await joinPartyGuest({
      repository:createGuestRequestRepository(db),eventId:"event-1",nickname:"Koen",eventCode:"wrong",
      expectedCodeHash:"hash",sessionSecret:"secret",hashCode:async()=>"nope",
      createToken:async()=>"token",createId:()=>"guest",nowSeconds:()=>100,
    });
    expect(result).toMatchObject({ok:false,error:{code:"invalid_event_code"}});
    expect(calls).toHaveLength(0);
  });

  it("enforces event-scoped guest, pause, hourly rate limit and duplicate checks", async () => {
    const missing=fakeDb({guest:null});
    expect(await submitGuestTrackRequest({
      repository:createGuestRequestRepository(missing.db),eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request",trackGateway:{getTrack:vi.fn()},
    })).toMatchObject({ok:false,error:{code:"guest_not_found"}});

    const paused=fakeDb({settings:[{key:"requests_paused",value:"true"}]});
    expect(await submitGuestTrackRequest({
      repository:createGuestRequestRepository(paused.db),eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request",trackGateway:{getTrack:vi.fn()},
    })).toMatchObject({ok:false,error:{code:"requests_paused"}});

    const unlimited=fakeDb({count:0,settings:[{key:"max_requests_per_hour",value:"20"}]});
    const unlimitedResult=await submitGuestTrackRequest({
      repository:createGuestRequestRepository(unlimited.db),eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request",trackGateway:{getTrack:async()=>spotifyTrack},
    });
    expect(unlimitedResult).toMatchObject({ok:true});
    const unlimitedInsert=unlimited.calls.find(call=>call.sql.includes("INTO requests"));
    expect(unlimitedInsert?.sql).not.toContain("status IN ('pending','approved','queued')");

    const limited=fakeDb({count:20,settings:[{key:"max_requests_per_hour",value:"20"}]});
    expect(await submitGuestTrackRequest({
      repository:createGuestRequestRepository(limited.db),eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request",trackGateway:{getTrack:vi.fn()},
    })).toMatchObject({ok:false,error:{code:"request_rate_limit"}});
    expect(limited.calls.some(call=>call.sql.includes("datetime('now','-1 hour')"))).toBe(true);

    const duplicate=fakeDb({duplicate:{id:"existing"}});
    expect(await submitGuestTrackRequest({
      repository:createGuestRequestRepository(duplicate.db),eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request",trackGateway:{getTrack:vi.fn()},
    })).toMatchObject({ok:false,error:{code:"duplicate_track"}});
  });

  it("verifies the Spotify track and applies auto-approve/auto-queue policy", async () => {
    const {db,calls}=fakeDb({settings:[
      {key:"auto_approve",value:"true"},{key:"auto_queue",value:"true"},
    ]});
    const result=await submitGuestTrackRequest({
      repository:createGuestRequestRepository(db),eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request-new",trackGateway:{getTrack:vi.fn(async()=>spotifyTrack)},
    });
    expect(result).toEqual({ok:true,value:{
      request:{id:"request-new",name:"Test Song",artists:["Artist A","Artist B"],status:"queued"},
    }});
    const insert=calls.find(call=>call.sql.includes("INTO requests"));
    expect(insert?.sql).toContain("INSERT OR IGNORE INTO requests");
    expect(insert?.sql).toContain("SELECT");
    expect(insert?.sql).toContain("status IN ('pending','approved','queued')");
    expect(insert?.sql).toContain("requested_at >= datetime('now','-30 minutes')");
    expect(insert?.values.slice(-2)).toEqual(["guest-1",20]);
    expect(insert?.values).toContain("queued");
    expect(insert?.values).toContain("Artist A, Artist B");
    expect(insert?.values).toContain("https://image.example/medium");
  });

  it("enforces the rolling 60-minute limit atomically when requests race", async () => {
    const {db}=fakeDb({count:19,countAfterInsert:20,insertChanges:0});
    const result=await submitGuestTrackRequest({
      repository:createGuestRequestRepository(db),eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request-raced",trackGateway:{getTrack:async()=>spotifyTrack},
    });
    expect(result).toMatchObject({ok:false,error:{code:"request_rate_limit",message:"Je maximum van 20 aanvragen per uur is bereikt."}});
  });

  it("rejects a duplicate when another request wins the concurrent insert race", async () => {
    const {db,calls}=fakeDb({insertChanges:0});
    const result=await submitGuestTrackRequest({
      repository:createGuestRequestRepository(db),eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request-raced",trackGateway:{getTrack:async()=>spotifyTrack},
    });
    expect(result).toMatchObject({ok:false,error:{code:"duplicate_track",message:"Dit nummer staat al in de wachtrij."}});
    expect(calls.some(call=>call.sql.includes("INTO requests"))).toBe(true);
  });

  it("does not insert when Spotify no longer returns the selected track", async () => {
    const {db,calls}=fakeDb();
    const result=await submitGuestTrackRequest({
      repository:createGuestRequestRepository(db),eventId:"event-1",guestId:"guest-1",trackId:spotifyTrack.id,
      createId:()=>"request",trackGateway:{getTrack:async()=>null},
    });
    expect(result).toMatchObject({ok:false,error:{code:"track_unavailable"}});
    expect(calls.some(call=>call.sql.includes("INTO requests"))).toBe(false);
  });
});
