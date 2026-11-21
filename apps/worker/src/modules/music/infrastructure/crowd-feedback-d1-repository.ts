import type { CrowdFeedbackRepository } from "../application/crowd-feedback";

type Database = Pick<D1Database, "prepare">;

export function createCrowdFeedbackRepository(db: Database): CrowdFeedbackRepository {
  return {
    async save({ guestId, eventId, feedback }) {
      const result = await db.prepare(
        "INSERT INTO guest_crowd_feedback (guest_id,event_id,atmosphere,energy,updated_at) " +
        "VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(guest_id) DO UPDATE SET " +
        "event_id=excluded.event_id,atmosphere=excluded.atmosphere,energy=excluded.energy,updated_at=CURRENT_TIMESTAMP " +
        "WHERE guest_crowd_feedback.event_id=excluded.event_id " +
        "AND guest_crowd_feedback.updated_at <= datetime('now','-60 seconds')",
      ).bind(guestId, eventId, feedback.atmosphere, feedback.energy).run();
      return (result.meta?.changes || 0) > 0;
    },
    async readRecent(eventId, windowMinutes) {
      const result = await db.prepare(
        "SELECT atmosphere,energy FROM guest_crowd_feedback " +
        "WHERE event_id=? AND updated_at >= datetime('now',?)",
      ).bind(eventId, "-" + windowMinutes + " minutes").all<{ atmosphere: string; energy: number }>();
      return result.results || [];
    },
  };
}
