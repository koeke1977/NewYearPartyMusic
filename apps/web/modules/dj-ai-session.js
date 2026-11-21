const DJ_AI_SESSION_KEY = "partyqueue_dj_ai_session";

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Owns the stable browser-side identifier for one DJ/AI conversation. */
export function getOrCreateDjAiSessionId(storage = localStorage, createId = () => crypto.randomUUID()) {
  const existing = storage.getItem(DJ_AI_SESSION_KEY) || "";
  if (SESSION_ID_PATTERN.test(existing)) return existing;

  const sessionId = createId();
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("Ongeldig DJ AI-sessie-ID.");
  storage.setItem(DJ_AI_SESSION_KEY, sessionId);
  return sessionId;
}
