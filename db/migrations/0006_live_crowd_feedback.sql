-- One current feedback signal per guest and event; no per-tap history or personal timeline.
CREATE TABLE IF NOT EXISTS guest_crowd_feedback (
  guest_id TEXT PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  atmosphere TEXT NOT NULL CHECK (atmosphere IN ('good', 'neutral', 'bad')),
  energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 5),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guest_crowd_feedback_event_time
  ON guest_crowd_feedback(event_id, updated_at);
