import type { AudienceIntelligenceRepository, AudiencePreferenceRow } from "../application/get-audience-intelligence";

type Database = Pick<D1Database, "prepare">;

export function createAudienceIntelligenceRepository(db: Database): AudienceIntelligenceRepository {
  return {
    async readEventPreferences(eventId) {
      const result = await db.prepare(
        "SELECT genre_ids_json,decade_ids_json,mood_ids_json,energy " +
        "FROM guest_music_preferences WHERE event_id=?",
      ).bind(eventId).all<AudiencePreferenceRow>();
      return result.results || [];
    },
  };
}
