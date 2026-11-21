import type { GuestMusicPreferenceRepository } from "../application/guest-music-preferences";

type Database = Pick<D1Database, "prepare">;

export function createGuestMusicPreferenceRepository(db: Database): GuestMusicPreferenceRepository {
  return {
    async save({ guestId, eventId, preferences }) {
      await db.prepare(
        "INSERT INTO guest_music_preferences (guest_id,event_id,genre_ids_json,decade_ids_json,mood_ids_json,energy,updated_at) " +
        "SELECT ?,?,?,?,?,?,CURRENT_TIMESTAMP WHERE EXISTS " +
        "(SELECT 1 FROM guests WHERE id=? AND event_id=?) " +
        "ON CONFLICT(guest_id) DO UPDATE SET event_id=excluded.event_id,genre_ids_json=excluded.genre_ids_json," +
        "decade_ids_json=excluded.decade_ids_json,mood_ids_json=excluded.mood_ids_json,energy=excluded.energy,updated_at=CURRENT_TIMESTAMP",
      ).bind(
        guestId, eventId, JSON.stringify(preferences.genreIds), JSON.stringify(preferences.decadeIds),
        JSON.stringify(preferences.moodIds), preferences.energy, guestId, eventId,
      ).run();
    },
  };
}
