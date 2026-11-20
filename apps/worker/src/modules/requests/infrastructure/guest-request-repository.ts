export type GuestRequestDatabase = Pick<D1Database, "prepare">;

import type { GuestRequestSettings, StoredTrackRequest } from "../application/guest-request-ports";

export type { GuestRequestSettings, StoredTrackRequest } from "../application/guest-request-ports";

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
    "SELECT key, value FROM settings WHERE key IN ('requests_paused','max_open_requests_per_guest','max_requests_per_30_minutes','auto_approve','auto_queue')",
  ).all<{ key: string; value: string }>();
  return Object.fromEntries((result.results || []).map(row => [row.key, row.value]));
}

export async function countRecentGuestRequests(db: GuestRequestDatabase, guestId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM requests WHERE guest_id = ? AND requested_at >= datetime('now','-30 minutes')",
  ).bind(guestId).first<{ count: number }>();
  return row?.count || 0;
}

export async function countOpenGuestRequests(db: GuestRequestDatabase, guestId: string): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM requests WHERE guest_id = ? AND status IN ('pending','approved','queued')",
  ).bind(guestId).first<{ count: number }>();
  return row?.count || 0;
}

export async function findActiveTrackRequest(db: GuestRequestDatabase, eventId: string, trackId: string): Promise<{ id: string; status?: string } | null> {
  return db.prepare(
    "SELECT id,status FROM requests WHERE event_id = ? AND spotify_track_id = ? AND status IN ('pending','approved','queued') LIMIT 1",
  ).bind(eventId, trackId).first<{ id: string; status: string }>();
}

export async function insertGuestTrackRequest(
  db: GuestRequestDatabase, request: StoredTrackRequest,
  limits: { maxOpenRequests: number; maxRequestsPer30Minutes: number },
): Promise<boolean> {
  const result = await db.prepare(
    "INSERT OR IGNORE INTO requests (id,event_id,guest_id,spotify_track_id,track_uri,track_name,artist_name,album_image_url,duration_ms,status,approved_at,queued_at) " +
    "SELECT ?,?,?,?,?,?,?,?,?,?,CASE WHEN ? IN ('approved','queued') THEN CURRENT_TIMESTAMP ELSE NULL END,CASE WHEN ? = 'queued' THEN CURRENT_TIMESTAMP ELSE NULL END " +
    "WHERE (SELECT COUNT(*) FROM requests WHERE guest_id = ? AND status IN ('pending','approved','queued')) < ? " +
    "AND (SELECT COUNT(*) FROM requests WHERE guest_id = ? AND requested_at >= datetime('now','-30 minutes')) < ?",
  ).bind(
    request.id, request.event_id, request.guest_id, request.spotify_track_id, request.track_uri,
    request.track_name, request.artist_name, request.album_image_url, request.duration_ms,
    request.status, request.status, request.status,
    request.guest_id, limits.maxOpenRequests, request.guest_id, limits.maxRequestsPer30Minutes,
  ).run();
  return result.meta.changes === 1;
}

export async function insertTrackRequest(db: GuestRequestDatabase, request: StoredTrackRequest): Promise<boolean> {
  const result = await db.prepare(
    "INSERT OR IGNORE INTO requests (id,event_id,guest_id,spotify_track_id,track_uri,track_name,artist_name,album_image_url,duration_ms,status,approved_at,queued_at) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?,CASE WHEN ? IN ('approved','queued') THEN CURRENT_TIMESTAMP ELSE NULL END,CASE WHEN ? = 'queued' THEN CURRENT_TIMESTAMP ELSE NULL END)",
  ).bind(
    request.id, request.event_id, request.guest_id, request.spotify_track_id, request.track_uri,
    request.track_name, request.artist_name, request.album_image_url, request.duration_ms,
    request.status, request.status, request.status,
  ).run();
  return result.meta.changes === 1;
}

export async function createDjQueueGuest(db: GuestRequestDatabase, eventId: string): Promise<string> {
  const guestId = "dj-music-director-" + eventId;
  await db.prepare("INSERT OR IGNORE INTO guests (id,event_id,nickname) VALUES (?,?,?)")
    .bind(guestId, eventId, "DJ#DATUUR AI").run();
  return guestId;
}

export async function appendRequestToQueueOrder(db: GuestRequestDatabase, requestId: string): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('partyqueue_order',json_array(?),CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value = CASE " +
    "WHEN json_valid(settings.value) THEN CASE WHEN json_type(settings.value)='array' THEN " +
    "CASE WHEN EXISTS (SELECT 1 FROM json_each(settings.value) WHERE value = ?) " +
    "THEN settings.value ELSE json_insert(settings.value,'$[#]',?) END " +
    "ELSE excluded.value END ELSE excluded.value END, updated_at=CURRENT_TIMESTAMP",
  ).bind(requestId, requestId, requestId).run();
}

export async function findEventRequestStatus(
  db: GuestRequestDatabase, eventId: string, requestId: string,
): Promise<{ id: string; status: string } | null> {
  return db.prepare("SELECT id,status FROM requests WHERE id = ? AND event_id = ?")
    .bind(requestId, eventId).first<{ id: string; status: string }>();
}

export async function readAutoQueueSetting(db: GuestRequestDatabase): Promise<boolean> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?")
    .bind("auto_queue").first<{ value: string }>();
  return row?.value === "true";
}

export async function transitionRequestStatus(
  db: GuestRequestDatabase, eventId: string, requestId: string, fromStatuses: string[],
  status: string, timestampColumn: "approved_at" | "queued_at" | "played_at" | null,
): Promise<boolean> {
  if (fromStatuses.length === 0) return false;
  const timestamp = timestampColumn ? ", " + timestampColumn + " = CURRENT_TIMESTAMP" : "";
  const placeholders = fromStatuses.map(() => "?").join(",");
  const result = await db.prepare(
    "UPDATE requests SET status = ?" + timestamp +
    " WHERE id = ? AND event_id = ? AND status IN (" + placeholders + ")",
  ).bind(status, requestId, eventId, ...fromStatuses).run();
  return result.meta.changes === 1;
}

export async function moveApprovedRequestToQueue(
  db: GuestRequestDatabase, eventId: string, requestId: string,
): Promise<boolean> {
  const result = await db.prepare(
    "UPDATE requests SET status='queued',queued_at=CURRENT_TIMESTAMP WHERE id=? AND event_id=? AND status='approved'",
  ).bind(requestId, eventId).run();
  return Boolean(result.meta.changes);
}
