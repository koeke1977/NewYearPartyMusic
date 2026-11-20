import type { QueuedPartyQueueRequest } from "../application/queue-dispatch-ports";
export type { QueuedPartyQueueRequest } from "../application/queue-dispatch-ports";
export type QueueDispatchDatabase = Pick<D1Database, "prepare">;

/** Claims the existing 30-second dispatch lease without stealing a live owner. */
export async function claimQueueDispatchLock(db: QueueDispatchDatabase, owner: string): Promise<boolean> {
  const result = await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_partyqueue_next_lock',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP " +
    "WHERE settings.updated_at < datetime('now','-30 seconds')",
  ).bind(owner).run();
  return Boolean(result.meta.changes);
}
export async function listQueuedPartyQueueRequests(db: QueueDispatchDatabase,eventId: string): Promise<QueuedPartyQueueRequest[]> {
  const result=await db.prepare("SELECT id,track_uri,track_name,artist_name,duration_ms,queued_at,requested_at FROM requests WHERE event_id=? AND status='queued' ORDER BY queued_at ASC,requested_at ASC")
    .bind(eventId).all<QueuedPartyQueueRequest>();
  return result.results||[];
}
export async function readSavedPartyQueueOrder(db: QueueDispatchDatabase): Promise<string[]> {
  const row=await db.prepare("SELECT value FROM settings WHERE key='partyqueue_order'").first<{value:string}>();
  try{const value:unknown=JSON.parse(row?.value||"[]");return Array.isArray(value)?value.filter((id):id is string=>typeof id==="string"):[];}catch{return [];}
}
export async function markPartyQueueRequestPlayed(db: QueueDispatchDatabase,eventId:string,requestId:string):Promise<boolean>{
  const result=await db.prepare("UPDATE requests SET status='played',played_at=CURRENT_TIMESTAMP WHERE id=? AND event_id=? AND status='queued'").bind(requestId,eventId).run();
  return Boolean(result.meta.changes);
}
export async function markPartyQueueFallbackInactive(db:QueueDispatchDatabase):Promise<void>{
  await db.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_active','false',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='false',updated_at=CURRENT_TIMESTAMP").run();
}
export async function saveLastPartyQueueTrack(db:QueueDispatchDatabase,track:{uri:string;durationMs:number;startedAt:number}):Promise<void>{
  await db.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_last_partyqueue_track',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(track)).run();
}
export async function releaseQueueDispatchLock(db:QueueDispatchDatabase,owner:string):Promise<void>{
  await db.prepare("DELETE FROM settings WHERE key='spotify_partyqueue_next_lock' AND value=?").bind(owner).run();
}
