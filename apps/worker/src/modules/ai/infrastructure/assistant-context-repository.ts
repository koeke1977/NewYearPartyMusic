import type { AssistantRequestCount } from "../context/assistant-context";
import type { AssistantContextSnapshot } from "../application/assistant-ports";
export type { AssistantContextSnapshot } from "../application/assistant-ports";

export type AssistantContextDatabase = Pick<D1Database, "prepare">;

/** Loads only DJ-authored preferences and aggregate counts; no Spotify content enters the AI context. */
export async function loadAssistantContextSnapshot(
  db: AssistantContextDatabase,
  eventId: string,
): Promise<AssistantContextSnapshot> {
  const profileKey = "dj_ai_profile_" + eventId;
  const [counts, profile] = await Promise.all([
    db.prepare(
      "SELECT status,COUNT(*) AS count FROM requests WHERE event_id=? " +
      "AND status IN ('pending','approved','queued','played') GROUP BY status",
    ).bind(eventId).all<AssistantRequestCount>(),
    db.prepare("SELECT value FROM settings WHERE key=?").bind(profileKey).first<{ value: string }>(),
  ]);

  return {
    requestCounts: counts.results || [],
    djPreferences: profile?.value ?? null,
  };
}
