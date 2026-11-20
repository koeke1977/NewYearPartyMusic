import { rememberDJPreference } from "../memory/dj-preferences";

export type AssistantSettingsDatabase = Pick<D1Database, "prepare">;

export type CachedSpotifyMatch = {
  query: string;
  tracks: Array<Record<string, unknown>>;
};

export type CachedAssistantAnswer = {
  answer: string;
  spotifyMatches: CachedSpotifyMatch[];
};

/** Persist only explicit DJ preferences; ordinary prompts do not cause a profile read. */
export async function rememberDJPreferenceInDatabase(
  db: AssistantSettingsDatabase,
  eventId: string,
  prompt: string,
): Promise<boolean> {
  if (!rememberDJPreference(undefined, prompt).updated) return false;

  const key = "dj_ai_profile_" + eventId;
  const existing = await db.prepare("SELECT value FROM settings WHERE key=?")
    .bind(key).first<{ value: string }>();
  const update = rememberDJPreference(existing?.value, prompt);
  if (!update.updated) return false;

  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(key, JSON.stringify(update.preferences)).run();
  return true;
}

/** Read an answer only when both its content key and existing ten-minute TTL match. */
export async function readAssistantAnswerCache(
  db: AssistantSettingsDatabase,
  cacheKey: string,
  now: number = Date.now(),
): Promise<CachedAssistantAnswer | null> {
  const row = await db.prepare(
    "SELECT value,updated_at FROM settings WHERE key='dj_ai_answer_cache'",
  ).first<{ value: string; updated_at: string }>();
  if (!row?.updated_at || now - Date.parse(row.updated_at + "Z") >= 10 * 60 * 1000) return null;

  try {
    const cached = JSON.parse(row.value) as {
      key?: unknown;
      answer?: unknown;
      spotifyMatches?: unknown;
    };
    if (cached.key !== cacheKey || typeof cached.answer !== "string" || !cached.answer) return null;
    return {
      answer: cached.answer,
      spotifyMatches: Array.isArray(cached.spotifyMatches)
        ? cached.spotifyMatches as CachedSpotifyMatch[]
        : [],
    };
  } catch {
    return null;
  }
}

export async function writeAssistantAnswerCache(
  db: AssistantSettingsDatabase,
  cacheKey: string,
  answer: string,
  spotifyMatches: CachedSpotifyMatch[],
): Promise<void> {
  await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('dj_ai_answer_cache',?,CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
  ).bind(JSON.stringify({ key: cacheKey, answer, spotifyMatches })).run();
}

/** Atomically claims the existing eight-second cooldown in D1. */
export async function claimAssistantRateLimit(
  db: AssistantSettingsDatabase,
): Promise<boolean> {
  const result = await db.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('dj_ai_last_request','1',CURRENT_TIMESTAMP) " +
    "ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP " +
    "WHERE settings.updated_at < datetime('now','-8 seconds')",
  ).run();
  return Boolean(result.meta.changes);
}
