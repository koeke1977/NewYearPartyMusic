PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_guests_event ON guests(event_id);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  spotify_track_id TEXT NOT NULL,
  track_uri TEXT NOT NULL,
  track_name TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  album_image_url TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'queued', 'played', 'rejected', 'failed')),
  moderation_reason TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  queued_at TEXT,
  played_at TEXT,
  spotify_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_event_status_time
  ON requests(event_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_requests_track_status
  ON requests(event_id, spotify_track_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_one_active_track
  ON requests(event_id, spotify_track_id)
  WHERE status IN ('pending', 'approved', 'queued');

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO events (id, name, starts_at, ends_at)
VALUES ('NYE2026', 'New Year''s Eve 2026', '2026-12-31T18:00:00+01:00', '2027-01-01T06:00:00+01:00');

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('auto_approve', 'true'),
  ('max_requests_per_hour', '20'),
  ('requests_paused', 'false');


-- Encrypted Spotify OAuth tokens for the single DJ account.
CREATE TABLE IF NOT EXISTS spotify_auth (
  id TEXT PRIMARY KEY CHECK (id = 'main'),
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hashed client-IP buckets for public event/DJ code brute-force protection.
CREATE TABLE IF NOT EXISTS auth_attempt_buckets (
  scope TEXT NOT NULL CHECK (scope IN ('guest_join', 'dj_login')),
  ip_hash TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 1),
  PRIMARY KEY (scope, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_auth_attempt_buckets_window
  ON auth_attempt_buckets(window_started_at);
