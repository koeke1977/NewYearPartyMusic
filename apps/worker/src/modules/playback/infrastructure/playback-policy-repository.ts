export type PlaybackPolicyDatabase = Pick<D1Database, "prepare">;
export type LastPartyQueueTrack = { uri: string; durationMs: number; startedAt: number };

export async function readPlaybackSetting(db: PlaybackPolicyDatabase, key: string): Promise<{ value: string; updated_at?: string } | null> {
  return db.prepare("SELECT value,updated_at FROM settings WHERE key=?").bind(key).first<{ value: string; updated_at?: string }>();
}

export async function readQueuedRequestCount(db: PlaybackPolicyDatabase, eventId: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM requests WHERE event_id=? AND status='queued'").bind(eventId).first<{ count: number }>();
  return row?.count || 0;
}

export async function claimSpotifyFallbackStart(db: PlaybackPolicyDatabase): Promise<boolean> {
  const result = await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_active','starting',CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value='starting',updated_at=CURRENT_TIMESTAMP " +
    "WHERE settings.value NOT IN ('true','starting') OR settings.updated_at < datetime('now','-1 minute')",
  ).run();
  return Boolean(result.meta.changes);
}

export async function setSpotifyFallbackState(db: PlaybackPolicyDatabase, value: "true" | "false"): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_active',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(value).run();
}

export async function setSpotifyFallbackActive(db: PlaybackPolicyDatabase): Promise<void> {
  await setSpotifyFallbackState(db, "true");
}

export async function readSpotifyFallbackError(db: PlaybackPolicyDatabase): Promise<string | null> {
  const setting = await readPlaybackSetting(db, "spotify_fallback_error");
  return setting?.value || null;
}

export async function setSpotifyManualPause(db: PlaybackPolicyDatabase, paused: boolean): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_manual_pause',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(paused ? "true" : "false").run();
}

export async function setSpotifyFallbackError(db: PlaybackPolicyDatabase, message: string): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_error',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(message).run();
}

export async function setSpotifyFallbackRetryAfter(db: PlaybackPolicyDatabase, timestamp: number): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_retry_after',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(String(timestamp)).run();
}

export async function clearSpotifyFallbackFailure(db: PlaybackPolicyDatabase): Promise<void> {
  await db.prepare("DELETE FROM settings WHERE key='spotify_fallback_retry_after'").run();
  await db.prepare("DELETE FROM settings WHERE key='spotify_fallback_error'").run();
}

/** D1 adapter for the application-owned playback policy repository. */
export function createPlaybackPolicyRepository(db: PlaybackPolicyDatabase): PlaybackPolicyRepository {
  return {
    readSetting: (key) => readPlaybackSetting(db, key),
    countQueuedRequests: (eventId) => readQueuedRequestCount(db, eventId),
    claimFallbackStart: () => claimSpotifyFallbackStart(db),
    setFallbackState: (value) => setSpotifyFallbackState(db, value),
    setFallbackError: (message) => setSpotifyFallbackError(db, message),
    setFallbackRetryAfter: (timestamp) => setSpotifyFallbackRetryAfter(db, timestamp),
    clearFallbackFailure: () => clearSpotifyFallbackFailure(db),
  };
}
