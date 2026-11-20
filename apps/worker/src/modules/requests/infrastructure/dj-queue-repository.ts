import type { GuestRequestDatabase } from "./guest-request-repository";

export type DjOverviewRequest = {
  id: string;
  spotify_track_id: string;
  track_uri: string;
  track_name: string;
  artist_name: string;
  album_image_url: string | null;
  duration_ms: number;
  status: string;
  moderation_reason: string | null;
  requested_at: string;
  queued_at: string | null;
  nickname: string;
  played_at?: string | null;
};

export type DjQueueTrack = { id: string; track_name: string; artist_name: string };

export async function readActiveDjRequests(db: GuestRequestDatabase, eventId: string) {
  return db.prepare(
    "SELECT r.id, r.spotify_track_id, r.track_uri, r.track_name, r.artist_name, r.album_image_url, r.duration_ms, r.status, r.moderation_reason, r.requested_at, r.queued_at, g.nickname FROM requests r JOIN guests g ON g.id = r.guest_id WHERE r.event_id = ? AND r.status IN ('pending','approved','queued') ORDER BY r.requested_at ASC",
  ).bind(eventId).all<DjOverviewRequest>();
}

export async function readRecentPlayedDjRequests(db: GuestRequestDatabase, eventId: string) {
  return db.prepare(
    "SELECT r.id, r.spotify_track_id, r.track_uri, r.track_name, r.artist_name, r.album_image_url, r.duration_ms, r.status, r.moderation_reason, r.requested_at, r.queued_at, g.nickname FROM requests r JOIN guests g ON g.id = r.guest_id WHERE r.event_id = ? AND r.status = 'played' ORDER BY r.played_at DESC LIMIT 100",
  ).bind(eventId).all<DjOverviewRequest>();
}

export async function readDjOverviewSettings(db: GuestRequestDatabase) {
  const result = await db.prepare(
    "SELECT key, value FROM settings WHERE key IN ('requests_paused','auto_approve','auto_queue','partyqueue_order')",
  ).all<{ key: string; value: string }>();
  return Object.fromEntries((result.results || []).map(row => [row.key, row.value])) as Record<string, string>;
}

export async function readQueuedRequestIds(db: GuestRequestDatabase, eventId: string): Promise<string[]> {
  const result = await db.prepare(
    "SELECT id FROM requests WHERE event_id=? AND status='queued'",
  ).bind(eventId).all<{ id: string }>();
  return (result.results || []).map(row => row.id);
}

export async function readQueuedRequestTracks(db: GuestRequestDatabase, eventId: string): Promise<DjQueueTrack[]> {
  const result = await db.prepare(
    "SELECT id,track_name,artist_name FROM requests WHERE event_id=? AND status='queued'",
  ).bind(eventId).all<DjQueueTrack>();
  return result.results || [];
}

export async function saveDjQueueOrder(db: GuestRequestDatabase, order: string[]): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('partyqueue_order',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(JSON.stringify(order)).run();
}

export async function readDjAiHistory(db: GuestRequestDatabase, eventId: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key=?")
    .bind("dj_ai_history_" + eventId).first<{ value: string }>();
  return row?.value ?? null;
}

export async function saveDjAiHistory(db: GuestRequestDatabase, eventId: string, history: Array<{ at: string; tracks: string[] }>): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind("dj_ai_history_" + eventId, JSON.stringify(history)).run();
}

export async function saveDjSetting(db: GuestRequestDatabase, key: string, enabled: boolean): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
  ).bind(key, String(enabled)).run();
}
