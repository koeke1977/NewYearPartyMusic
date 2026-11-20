import type {
  AssistantPlayedTrack,
  AssistantQueueTrack,
  AssistantRequestCount,
} from "../context/assistant-context";
import type { AssistantContextSnapshot } from "../application/assistant-ports";
export type { AssistantContextSnapshot } from "../application/assistant-ports";

export type AssistantContextDatabase = Pick<D1Database, "prepare">;

/** Loads the bounded, read-only D1 snapshot used to construct an assistant prompt. */
export async function loadAssistantContextSnapshot(
  db: AssistantContextDatabase,
  eventId: string,
): Promise<AssistantContextSnapshot> {
  const profileKey = "dj_ai_profile_" + eventId;
  const historyKey = "dj_ai_history_" + eventId;
  const [queue, played, counts, order, profile, history] = await Promise.all([
    db.prepare(
      "SELECT id,track_name,artist_name,duration_ms,status,queued_at,requested_at FROM requests " +
      "WHERE event_id=? AND status IN ('pending','approved','queued') " +
      "ORDER BY CASE status WHEN 'queued' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, requested_at DESC LIMIT 100",
    ).bind(eventId).all<AssistantQueueTrack>(),
    db.prepare(
      "SELECT track_name,artist_name FROM requests WHERE event_id=? AND status='played' ORDER BY played_at DESC LIMIT 8",
    ).bind(eventId).all<AssistantPlayedTrack>(),
    db.prepare(
      "SELECT status,COUNT(*) AS count FROM requests WHERE event_id=? " +
      "AND status IN ('pending','approved','queued','played') GROUP BY status",
    ).bind(eventId).all<AssistantRequestCount>(),
    db.prepare("SELECT value FROM settings WHERE key='partyqueue_order'").first<{ value: string }>(),
    db.prepare("SELECT value FROM settings WHERE key=?").bind(profileKey).first<{ value: string }>(),
    db.prepare("SELECT value FROM settings WHERE key=?").bind(historyKey).first<{ value: string }>(),
  ]);

  return {
    queue: queue.results || [],
    playedTracks: played.results || [],
    requestCounts: counts.results || [],
    savedQueueOrder: order?.value ?? null,
    djPreferences: profile?.value ?? null,
    acceptedSetHistory: history?.value ?? null,
  };
}
