import type { AssistantContextSnapshot } from "../application/assistant-ports";
export type { AssistantContextSnapshot } from "../application/assistant-ports";

export type AssistantContextDatabase = Pick<D1Database, "prepare">;

/** Loads only DJ-authored preferences; no Spotify-derived data or usage metrics enter AI. */
export async function loadAssistantContextSnapshot(
  db: AssistantContextDatabase,
  eventId: string,
): Promise<AssistantContextSnapshot> {
  const profileKey = "dj_ai_profile_" + eventId;
  const profile = await db.prepare("SELECT value FROM settings WHERE key=?")
    .bind(profileKey).first<{ value: string }>();
  return { djPreferences: profile?.value ?? null };
}
