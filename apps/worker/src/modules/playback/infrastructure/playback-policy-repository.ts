export type PlaybackPolicyDatabase = Pick<D1Database, "prepare">;

export type LastPartyQueueTrack = {
  uri: string;
  durationMs: number;
  startedAt: number;
};

export type PlaybackSetting = { value: string; updated_at?: string };

export async function readPlaybackSetting(
  db: PlaybackPolicyDatabase,
  key: string,
): Promise<PlaybackSetting | null> {
  return db.prepare("SELECT value,updated_at FROM settings WHERE key=?")
    .bind(key).first<PlaybackSetting>();
}

export async function readQueuedRequestCount(
  db: PlaybackPolicyDatabase,
  eventId: string,
): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM requests WHERE event_id=? AND status='queued'",
  ).bind(eventId).first<{ count: number }>();
  return Number(row?.count || 0);
}

/** Atomic lease: an active fallback is never stolen; stale 'starting' leases can recover. */
export async function claimSpotifyFallbackStart(db: PlaybackPolicyDatabase): Promise<boolean> {
  const result = await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_active','starting',CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value='starting',updated_at=CURRENT_TIMESTAMP " +
    "WHERE settings.value!='true' AND (settings.value!='starting' OR settings.updated_at < datetime('now','-60 seconds'))",
  ).run();
  return Boolean(result.meta.changes);
}

export async function setSpotifyFallbackState(db: PlaybackPolicyDatabase, value: "true" | "false"): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_active',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(value).run();
}

export async function setSpotifyFallbackError(db: PlaybackPolicyDatabase, message: string): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_error',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(message.slice(0, 500)).run();
}

export async function setSpotifyFallbackRetryAfter(db: PlaybackPolicyDatabase, timestamp: number): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_retry_after',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(String(timestamp)).run();
}

export async function clearSpotifyFallbackFailure(db: PlaybackPolicyDatabase): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM settings WHERE key='spotify_fallback_retry_after'"),
    db.prepare("DELETE FROM settings WHERE key='spotify_fallback_error'"),
  ]);
}

export async function setSpotifyFallbackActive(db: PlaybackPolicyDatabase): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_active','true',CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value='true',updated_at=CURRENT_TIMESTAMP",
  ).run();
}

export async function readSpotifyFallbackError(db: PlaybackPolicyDatabase): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key='spotify_fallback_error'")
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSpotifyManualPause(db: PlaybackPolicyDatabase, paused: boolean): Promise<void> {
  const value = paused ? "true" : "false";
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_manual_pause',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(value).run();
}
