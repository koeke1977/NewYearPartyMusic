CREATE TABLE IF NOT EXISTS auth_attempt_buckets (
  scope TEXT NOT NULL CHECK (scope IN ('guest_join', 'dj_login')),
  ip_hash TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 1),
  PRIMARY KEY (scope, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_auth_attempt_buckets_window
  ON auth_attempt_buckets(window_started_at);
