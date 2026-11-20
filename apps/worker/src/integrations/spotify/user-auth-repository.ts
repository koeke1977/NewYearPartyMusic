export type SpotifyAuthDatabase = Pick<D1Database, "prepare">;

export type EncryptedSpotifyTokenPair = {
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: number;
};

/** Persists only already-encrypted Spotify credentials. */
export async function saveEncryptedSpotifyTokens(
  db: SpotifyAuthDatabase,
  accessTokenEncrypted: string,
  refreshTokenEncrypted: string,
  expiresAt: number,
): Promise<void> {
  await db.prepare(
    "INSERT INTO spotify_auth (id,access_token_enc,refresh_token_enc,expires_at,updated_at) " +
    "VALUES ('main',?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET " +
    "access_token_enc=excluded.access_token_enc,refresh_token_enc=excluded.refresh_token_enc," +
    "expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP",
  ).bind(accessTokenEncrypted, refreshTokenEncrypted, expiresAt).run();
}

export async function readEncryptedSpotifyTokens(
  db: SpotifyAuthDatabase,
): Promise<EncryptedSpotifyTokenPair | null> {
  return db.prepare(
    "SELECT access_token_enc,refresh_token_enc,expires_at FROM spotify_auth WHERE id='main'",
  ).first<EncryptedSpotifyTokenPair>();
}

/** Atomically claims the existing 30-second refresh lease. */
export async function claimSpotifyRefreshLock(
  db: SpotifyAuthDatabase,
  owner: string,
): Promise<boolean> {
  const result = await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('spotify_token_refresh_lock',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP " +
    "WHERE settings.updated_at < datetime('now','-30 seconds')",
  ).bind(owner).run();
  return Boolean(result.meta.changes);
}

export async function releaseSpotifyRefreshLock(
  db: SpotifyAuthDatabase,
  owner: string,
): Promise<void> {
  await db.prepare(
    "DELETE FROM settings WHERE key='spotify_token_refresh_lock' AND value=?",
  ).bind(owner).run();
}

export async function invalidateSpotifyAccessToken(db: SpotifyAuthDatabase): Promise<void> {
  await db.prepare("UPDATE spotify_auth SET expires_at=0 WHERE id='main'").run();
}


/**
 * Deletes the stored DJ Spotify credentials. A live token-refresh lease blocks
 * the deletion so an in-flight refresh cannot silently recreate the connection.
 */
export async function deleteEncryptedSpotifyTokens(db: SpotifyAuthDatabase): Promise<boolean> {
  const result = await db.prepare(
    "DELETE FROM spotify_auth WHERE id='main' AND NOT EXISTS (" +
    "SELECT 1 FROM settings WHERE key='spotify_token_refresh_lock' " +
    "AND updated_at >= datetime('now','-30 seconds'))",
  ).run();
  if (!result.meta.changes) {
    const remaining = await readEncryptedSpotifyTokens(db);
    if (remaining) return false;
  }
  await db.prepare("DELETE FROM settings WHERE key='spotify_token_refresh_lock'").run();
  return true;
}
