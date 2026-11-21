-- Event-scoped temporary music preferences. Rows cascade with the guest/event and contain no durable profile.
CREATE TABLE IF NOT EXISTS guest_music_preferences (
  guest_id TEXT PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  genre_ids_json TEXT NOT NULL CHECK (json_valid(genre_ids_json) AND json_type(genre_ids_json) = 'array'),
  decade_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(decade_ids_json) AND json_type(decade_ids_json) = 'array'),
  mood_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(mood_ids_json) AND json_type(mood_ids_json) = 'array'),
  energy INTEGER CHECK (energy IS NULL OR energy BETWEEN 1 AND 10),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guest_music_preferences_event
  ON guest_music_preferences(event_id);
