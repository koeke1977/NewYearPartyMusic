import type { EventFlushRepository } from "../application/flush-event";

export type EventFlushDatabase = Pick<D1Database, "prepare" | "batch">;

/**
 * D1 batch executes these statements transactionally. Guest-owned requests,
 * preferences and feedback are removed through their existing FK cascades.
 * Application settings, Spotify OAuth and DJ-authored general preferences stay.
 */
export function createEventFlushRepository(db: EventFlushDatabase): EventFlushRepository {
  return {
    async flushTemporaryEventData(eventId) {
      await db.batch([
        db.prepare("DELETE FROM guests WHERE event_id = ?").bind(eventId),
        db.prepare("DELETE FROM dj_ai_turns WHERE event_id = ?").bind(eventId),
        db.prepare("DELETE FROM settings WHERE key = 'partyqueue_order'"),
        db.prepare("DELETE FROM settings WHERE key = ?").bind("dj_ai_history_" + eventId),
        db.prepare("DELETE FROM settings WHERE key = 'dj_ai_answer_cache'"),
        db.prepare("DELETE FROM settings WHERE key = 'spotify_last_partyqueue_track'"),
      ]);
    },
  };
}
