import { describe, expect, it, vi } from "vitest";
import { dispatchNextTrack } from "../../apps/worker/src/modules/queue/application/dispatch-next-track";
import type { QueueDispatchRepository, QueuedPartyQueueRequest } from "../../apps/worker/src/modules/queue/application/queue-dispatch-ports";

const track=(id:string,queuedAt="2026-11-20 10:00:00"):QueuedPartyQueueRequest=>({
 id,track_uri:"spotify:track:"+id,track_name:"Song "+id,artist_name:"Artist",
 duration_ms:180000,queued_at:queuedAt,requested_at:queuedAt,
});
function fakeRepository(options:{claim?:boolean;queued?:QueuedPartyQueueRequest[];order?:string[];updated?:boolean}={}){
 const calls:string[]=[];
 const repository:QueueDispatchRepository={
  claimLock:vi.fn(async()=>{calls.push("claim");return options.claim??true;}),
  listQueuedRequests:vi.fn(async()=>{calls.push("list");return options.queued||[];}),
  readSavedOrder:vi.fn(async()=>{calls.push("order");return options.order||[];}),
  markRequestPlayed:vi.fn(async()=>{calls.push("played");return options.updated??true;}),
  markFallbackInactive:vi.fn(async()=>{calls.push("fallback");}),
  saveLastTrack:vi.fn(async()=>{calls.push("last-track");}),
  releaseLock:vi.fn(async()=>{calls.push("release");}),
 };
 return {repository,calls};
}
describe("dispatchNextTrack",()=>{
 it("does not call Spotify or release a lock it did not acquire",async()=>{
  const {repository,calls}=fakeRepository({claim:false});const playTrack=vi.fn();
  const result=await dispatchNextTrack({repository,eventId:"event-1",playTrack,createOwner:()=>"owner-1"});
  expect(result).toMatchObject({ok:false,busy:true});expect(playTrack).not.toHaveBeenCalled();expect(calls).toEqual(["claim"]);
 });
 it("releases the acquired lock when the queue is empty",async()=>{
  const {repository,calls}=fakeRepository();
  const result=await dispatchNextTrack({repository,eventId:"event-1",playTrack:vi.fn(),createOwner:()=>"owner-2"});
  expect(result).toMatchObject({ok:false,error:"Er staan geen PartyQueue-aanvragen klaar."});
  expect(calls).toEqual(["claim","list","order","release"]);
 });
 it("dispatches the saved first track and persists playback state before releasing the lock",async()=>{
  const {repository,calls}=fakeRepository({queued:[track("first"),track("second")],order:["second","first"]});
  const playTrack=vi.fn(async()=>({ok:true,status:204}));
  const result=await dispatchNextTrack({repository,eventId:"event-1",playTrack,createOwner:()=>"owner-3",now:()=>123456});
  expect(result).toEqual({ok:true,track:{name:"Song second",artist:"Artist"},requestId:"second"});
  expect(playTrack).toHaveBeenCalledWith("spotify:track:second");
  expect(calls).toEqual(["claim","list","order","played","fallback","last-track","release"]);
  expect(repository.saveLastTrack).toHaveBeenCalledWith({uri:"spotify:track:second",durationMs:180000,startedAt:123456});
 });
 it("does not mark a request played when Spotify rejects playback and still releases the lock",async()=>{
  const {repository,calls}=fakeRepository({queued:[track("failed")]});
  const result=await dispatchNextTrack({repository,eventId:"event-1",playTrack:async()=>({ok:false,status:502}),createOwner:()=>"owner-4"});
  expect(result).toMatchObject({ok:false,error:"Spotify kon het volgende nummer niet starten (HTTP 502)."});
  expect(repository.markRequestPlayed).not.toHaveBeenCalled();expect(calls.at(-1)).toBe("release");
 });
 it("reports a concurrent request-state change after Spotify starts and releases the lock",async()=>{
  const {repository,calls}=fakeRepository({queued:[track("raced")],updated:false});
  const result=await dispatchNextTrack({repository,eventId:"event-1",playTrack:async()=>({ok:true,status:204}),createOwner:()=>"owner-5"});
  expect(result).toMatchObject({ok:false,error:"De aanvraag is intussen gewijzigd; probeer opnieuw."});
  expect(repository.saveLastTrack).not.toHaveBeenCalled();expect(calls.at(-1)).toBe("release");
 });
});
