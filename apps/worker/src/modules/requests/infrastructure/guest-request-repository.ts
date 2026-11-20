export type GuestRequestDatabase = Pick<D1Database, "prepare">;

export type GuestRequestSettings = {
  requests_paused?: string;
  max_requests_per_hour?: string;
  auto_approve?: string;
  auto_queue?: string;
};

export type StoredTrackRequest = {
  id: string;
  event_id: string;
  guest_id: string;
  spotify_track_id: string;
  track_uri: string;
  track_name: string;
  artist_name: string;
  album_image_url: string | null;
  duration_ms: number;
  status: string;
};

export async function findActiveEvent(db: GuestRequestDatabase, eventId: string): Promise<{ id: string } | null> {
  return db.prepare("SELECT id FROM events WHERE id = ? AND is_active = 1 LIMIT 1")
    .bind(eventId).first<{ id: string }>();
}

export async function insertGuest(db: GuestRequestDatabase, guest: { id: string; eventId: string; nickname: string }): Promise<void> {
  await db.prepare("INSERT INTO guests (id, event_id, nickname) VALUES (?, ?, ?)")
    .bind(guest.id, guest.eventId, guest.nickname).run();
}

export async function findEventGuest(db: GuestRequestDatabase, guestId: string, eventId: string): Promise<{ id: string } | null> {
  return db.prepare("SELECT id FROM guests WHERE id = ? AND event_id = ?")
    .bind(guestId, eventId).first<{ id: string }>();
}

export async function readGuestRequestSettings(db: GuestRequestDatabase): Promise<GuestRequestSettings> {
  const result = await db.prepare(
    "SELECT key, value FROM settings WHERE key IN ('requests_paused','max_requests_per_hour','auto_approve','auto_queue')",
  ).all<{ key: string; value: string }>();
  return Object.fromEntries((result.results || []).map(row => [row.key, row.value]));
}

export async function countRecentGuestRequests(db: GuestRequestDatabase, guestId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM requests WHERE guest_id = ? AND requested_at >= datetime('now','-1 hour')",
  ).bind(guestId).first<{ count: number }>();
  return row?.count || 0;
}

export async function findActiveTrackRequest(db: GuestRequestDatabase, eventId: string, trackId: string): Promise<{ id: string; status?: string } | null> {
  return db.prepare(
    "SELECT id,status FROM requests WHERE event_id = ? AND spotify_track_id = ? AND status IN ('pending','approved','queued') LIMIT 1",
  ).bind(eventId, trackId).first<{ id: string; status: string }>();
}

export async function insertTrackRequest(db: GuestRequestDatabase, request: StoredTrackRequest): Promise<void> {
  await db.prepare(
    "INSERT INTO requests (id,event_id,guest_id,spotify_track_id,track_uri,track_name,artist_name,album_image_url,duration_ms,status,approved_at,queued_at) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?,CASE WHEN ? IN ('approved','queued') THEN CURRENT_TIMESTAMP ELSE NULL END,CASE WHEN ? = 'queued' THEN CURRENT_TIMESTAMP ELSE NULL END)",
  ).bind(
    request.id, request.event_id, request.guest_id, request.spotify_track_id, request.track_uri,
    request.track_name, request.artist_name, request.album_image_url, request.duration_ms,
    request.status, request.status, request.status,
  ).run();
}

import type { GuestRequestDatabase, StoredTrackRequest } from "./guest-request-repository";
import { findActiveTrackRequest, insertTrackRequest } from "./guest-request-repository";

export async function createDjQueueGuest(db: GuestRequestDatabase, eventId: string): Promise<string> {
  const guestId = "dj-music-director-" + eventId;
  await db.prepare("INSERT OR IGNORE INTO guests (id,event_id,nickname) VALUES (?,?,?)")
    .bind(guestId,eventId,"DJ#DATUUR AI").run();
  return guestId;
}

export async function readSavedQueueOrder(db: GuestRequestDatabase): Promise<string[]> {
  const row = await db.prepare("SELECT value FROM settings WHERE key='partyqueue_order'").first<{value:string}>();
  try {
    const parsed: unknown = JSON.parse(row?.value || "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

export async function appendRequestToQueueOrder(db: GuestRequestDatabase, requestId: string): Promise<void> {
  const order = await readSavedQueueOrder(db);
  const next = order.filter(id => id !== requestId);
  next.push(requestId);
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('partyqueue_order',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(JSON.stringify(next)).run();
}

export async function findEventRequestStatus(
  db: GuestRequestDatabase,eventId:string,requestId:string,
): Promise<{id:string;status:string}|null> {
  return db.prepare("SELECT id,status FROM requests WHERE id = ? AND event_id = ?")
    .bind(requestId,eventId).first<{id:string;status:string}>();
}

export async function readAutoQueueSetting(db: GuestRequestDatabase): Promise<boolean> {
  const row=await db.prepare("SELECT value FROM settings WHERE key = ?").bind("auto_queue").first<{value:string}>();
  return row?.value === "true";
}

export async function updateRequestStatus(
  db:GuestRequestDatabase,eventId:string,requestId:string,status:string,timestampColumn:"approved_at"|"queued_at"|"played_at"|null,
):Promise<void>{
  const sql=timestampColumn
    ? "UPDATE requests SET status = ?, "+timestampColumn+" = CURRENT_TIMESTAMP WHERE id = ? AND event_id = ?"
    : "UPDATE requests SET status = ? WHERE id = ? AND event_id = ?";
  await db.prepare(sql).bind(status,requestId,eventId).run();
}

export async function moveApprovedRequestToQueue(db:GuestRequestDatabase,eventId:string,requestId:string):Promise<boolean>{
  const result=await db.prepare(
    "UPDATE requests SET status='queued',queued_at=CURRENT_TIMESTAMP WHERE id=? AND event_id=? AND status='approved'",
  ).bind(requestId,eventId).run();
  return Boolean(result.meta.changes);
}
