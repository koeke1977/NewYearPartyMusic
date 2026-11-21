import type { AssistantConversationTurn } from "../application/assistant-ports";

export type AssistantConversationDatabase = Pick<D1Database, "prepare" | "batch">;

const MAX_STORED_TURNS = 8;
const MAX_CONTEXT_CHARS_PER_TURN = 2400;

/** Loads only recent DJ prompts and AI answers for this event-scoped browser session. */
export async function loadAssistantConversation(
  db: Pick<D1Database, "prepare">,
  eventId: string,
  sessionId: string,
): Promise<AssistantConversationTurn[]> {
  const result = await db.prepare(
    "SELECT role, content FROM dj_ai_turns " +
    "WHERE event_id=? AND session_id=? AND created_at >= datetime('now','-7 days') " +
    "ORDER BY id DESC LIMIT ?",
  ).bind(eventId, sessionId, MAX_STORED_TURNS).all<{ role: string; content: string }>();

  return (result.results || [])
    .reverse()
    .filter((turn): turn is AssistantConversationTurn =>
      (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string")
    .map(turn => ({ role: turn.role, content: turn.content.slice(0, MAX_CONTEXT_CHARS_PER_TURN) }));
}

/** Stores a successful turn pair atomically. Spotify catalogue results are never passed to this repository. */
export async function saveAssistantConversationTurn(
  db: AssistantConversationDatabase,
  eventId: string,
  sessionId: string,
  prompt: string,
  answer: string,
): Promise<void> {
  await db.batch([
    db.prepare(
      "INSERT INTO dj_ai_turns (event_id,session_id,role,content) VALUES (?,?, 'user',?)",
    ).bind(eventId, sessionId, prompt.slice(0, 600)),
    db.prepare(
      "INSERT INTO dj_ai_turns (event_id,session_id,role,content) VALUES (?,?, 'assistant',?)",
    ).bind(eventId, sessionId, answer.slice(0, 8000)),
    db.prepare(
      "DELETE FROM dj_ai_turns WHERE event_id=? AND session_id=? AND id NOT IN " +
      "(SELECT id FROM dj_ai_turns WHERE event_id=? AND session_id=? ORDER BY id DESC LIMIT 8)",
    ).bind(eventId, sessionId, eventId, sessionId),
  ]);
}

/** Daily scheduled cleanup; conversation history expires after seven days. */
export async function deleteExpiredAssistantConversationTurns(
  db: Pick<D1Database, "prepare">,
): Promise<void> {
  await db.prepare(
    "DELETE FROM dj_ai_turns WHERE created_at < datetime('now','-7 days')",
  ).run();
}
