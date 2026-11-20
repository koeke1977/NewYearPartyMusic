import { describe, expect, it, vi } from "vitest";
import type { PlaybackPolicyRepository, PlaybackSetting } from "../../apps/worker/src/modules/playback/application/playback-policy-ports";
import { maybeAdvancePartyQueue, maybeStartSpotifyFallback } from "../../apps/worker/src/modules/playback/application/playback-automation";

function fakeRepository(settings: Record<string, PlaybackSetting> = {}, queued = 0, claim = true) {
 const writes: Array<[string, unknown]> = [];
 const repository: PlaybackPolicyRepository = {
  readSetting: async key => settings[key] || null,
  countQueuedRequests: async () => queued,
  claimFallbackStart: async () => { writes.push(["claim", claim]); return claim; },
  setFallbackState: async value => { writes.push(["state", value]); },
  setFallbackError: async value => { writes.push(["error", value]); },
  setFallbackRetryAfter: async value => { writes.push(["retry", value]); },
  clearFallbackFailure: async () => { writes.push(["clear", true]); },
 };
 return { repository, writes };
}
const last = (startedAt: number, durationMs = 180000) => JSON.stringify({ uri: "spotify:track:last", durationMs, startedAt });

describe("queue advancement policy", () => {
 it("does not advance while Spotify is playing", async () => {
  const {repository}=fakeRepository(); const dispatchNext=vi.fn();
  expect(await maybeAdvancePartyQueue({repository,eventId:"event",dispatchNext},true)).toEqual({advanced:false}); expect(dispatchNext).not.toHaveBeenCalled();
 });
 it("respects manual pause", async () => {
  const {repository}=fakeRepository({spotify_manual_pause:{value:"true"},spotify_last_partyqueue_track:{value:last(1000)}},2); const dispatchNext=vi.fn();
  expect(await maybeAdvancePartyQueue({repository,eventId:"event",dispatchNext,now:()=>200000},false)).toEqual({advanced:false}); expect(dispatchNext).not.toHaveBeenCalled();
 });
 it("honours the 2.5-second end tolerance", async () => {
  const {repository}=fakeRepository({spotify_last_partyqueue_track:{value:last(1000)}},1); const dispatchNext=vi.fn(async()=>({ok:true}));
  expect((await maybeAdvancePartyQueue({repository,eventId:"event",dispatchNext,now:()=>178400},false)).advanced).toBe(false);
  expect(await maybeAdvancePartyQueue({repository,eventId:"event",dispatchNext,now:()=>178501},false)).toEqual({advanced:true}); expect(dispatchNext).toHaveBeenCalledTimes(1);
 });
 it("treats lock contention as normal and returns dispatch errors", async () => {
  const {repository}=fakeRepository({spotify_last_partyqueue_track:{value:last(1000)}},1);
  expect(await maybeAdvancePartyQueue({repository,eventId:"event",dispatchNext:async()=>({ok:false,busy:true}),now:()=>200000},false)).toEqual({advanced:false});
  expect(await maybeAdvancePartyQueue({repository,eventId:"event",dispatchNext:async()=>({ok:false,error:"Spotify fout"}),now:()=>200000},false)).toEqual({advanced:false,error:"Spotify fout"});
 });
 it("ignores malformed last-track state", async () => {
  const {repository}=fakeRepository({spotify_last_partyqueue_track:{value:"{bad"}},1); const dispatchNext=vi.fn();
  expect(await maybeAdvancePartyQueue({repository,eventId:"event",dispatchNext},false)).toEqual({advanced:false}); expect(dispatchNext).not.toHaveBeenCalled();
 });
});

describe("Spotify fallback policy", () => {
 it("respects manual pause and queued requests", async () => {
  const startFallback=vi.fn();
  expect(await maybeStartSpotifyFallback({repository:fakeRepository({spotify_manual_pause:{value:"true"},spotify_last_partyqueue_track:{value:last(1000)}}).repository,eventId:"event",startFallback,now:()=>200000},null,false)).toBe(false);
  expect(await maybeStartSpotifyFallback({repository:fakeRepository({spotify_last_partyqueue_track:{value:last(1000)}},1).repository,eventId:"event",startFallback,now:()=>200000},null,false)).toBe(false); expect(startFallback).not.toHaveBeenCalled();
 });
 it("honours active/starting states, retry delay and 4-second tolerance", async () => {
  const startFallback=vi.fn(), now=200000;
  expect(await maybeStartSpotifyFallback({repository:fakeRepository({spotify_fallback_active:{value:"true"}}).repository,eventId:"event",startFallback,now:()=>now},null,false)).toBe(true);
  expect(await maybeStartSpotifyFallback({repository:fakeRepository({spotify_fallback_active:{value:"starting",updated_at:"1970-01-01 00:03:19"}}).repository,eventId:"event",startFallback,now:()=>now},null,false)).toBe(false);
  expect(await maybeStartSpotifyFallback({repository:fakeRepository({spotify_fallback_retry_after:{value:String(now+10000)},spotify_last_partyqueue_track:{value:last(1000)}}).repository,eventId:"event",startFallback,now:()=>now},null,false)).toBe(false);
  expect(await maybeStartSpotifyFallback({repository:fakeRepository({spotify_last_partyqueue_track:{value:last(1000)}}).repository,eventId:"event",startFallback,now:()=>176999},null,false)).toBe(false); expect(startFallback).not.toHaveBeenCalled();
 });
 it("does not replace the same track while it is still playing", async () => {
  const {repository}=fakeRepository({spotify_last_partyqueue_track:{value:last(1000)}}); const startFallback=vi.fn();
  expect(await maybeStartSpotifyFallback({repository,eventId:"event",startFallback,now:()=>200000},"spotify:track:last",true)).toBe(false); expect(startFallback).not.toHaveBeenCalled();
 });
 it("claims once, starts fallback and clears failure state", async () => {
  const {repository,writes}=fakeRepository({spotify_last_partyqueue_track:{value:last(1000)}}); const startFallback=vi.fn(async()=>{});
  expect(await maybeStartSpotifyFallback({repository,eventId:"event",startFallback,now:()=>200000},null,false)).toBe(true); expect(startFallback).toHaveBeenCalledTimes(1); expect(writes).toContainEqual(["claim",true]); expect(writes).toContainEqual(["clear",true]);
 });
 it("backs off one minute and persists Spotify errors", async () => {
  const {repository,writes}=fakeRepository({spotify_last_partyqueue_track:{value:last(1000)}}); const startFallback=vi.fn(async()=>{throw new Error("Spotify offline")});
  expect(await maybeStartSpotifyFallback({repository,eventId:"event",startFallback,now:()=>200000},null,false)).toBe(false);
  expect(writes).toContainEqual(["error","Spotify offline"]); expect(writes).toContainEqual(["state","false"]); expect(writes).toContainEqual(["retry",260000]);
 });
 it("does not start when another poll owns the lease", async () => {
  const {repository}=fakeRepository({spotify_last_partyqueue_track:{value:last(1000)}},0,false); const startFallback=vi.fn();
  expect(await maybeStartSpotifyFallback({repository,eventId:"event",startFallback,now:()=>200000},null,false)).toBe(false); expect(startFallback).not.toHaveBeenCalled();
 });
});
