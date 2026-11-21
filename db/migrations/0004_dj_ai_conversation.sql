-- Persist a bounded DJ/AI conversation for follow-up requests.
-- Only DJ-authored prompts and AI-generated advice are stored; Spotify results are never written here.
CREATE TABLE IF NOT EXISTS dj_ai_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(content) <= 8000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dj_ai_turns_session
  ON dj_ai_turns(event_id, session_id, id);
CREATE INDEX IF NOT EXISTS idx_dj_ai_turns_retention
  ON dj_ai_turns(created_at);
