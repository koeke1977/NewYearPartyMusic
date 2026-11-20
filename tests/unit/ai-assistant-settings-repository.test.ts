import { describe, expect, it, vi } from "vitest";
import {
  claimAssistantRateLimit,
  readAssistantAnswerCache,
  rememberDJPreferenceInDatabase,
  writeAssistantAnswerCache,
} from "../../apps/worker/src/modules/ai/infrastructure/assistant-settings-repository";

function fakeDb(options: {
  first?: unknown;
  changes?: number;
} = {}) {
  const run = vi.fn().mockResolvedValue({ meta: { changes: options.changes ?? 1 } });
  const first = vi.fn().mockResolvedValue(options.first ?? null);
  const statement = { bind: vi.fn(), first, run };
  statement.bind = vi.fn().mockReturnValue(statement);
  const prepare = vi.fn().mockReturnValue(statement);
  const bind = statement.bind;
  return { db: { prepare } as never, prepare, bind, first, run };
}

describe("AI assistant settings repository", () => {
  it("does not read or write memory for an ordinary prompt", async () => {
    const { db, prepare } = fakeDb();
    await expect(rememberDJPreferenceInDatabase(db, "event-1", "Maak het wat dansbaarder")).resolves.toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("loads and persists an explicit DJ preference", async () => {
    const { db, prepare, bind, run } = fakeDb({ first: { value: '["Hou van disco"]' } });
    await expect(rememberDJPreferenceInDatabase(db, "event-1", "Onthoud: liever meer 90s dance")).resolves.toBe(true);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(bind).toHaveBeenLastCalledWith("dj_ai_profile_event-1", expect.stringContaining("90s dance"));
    expect(run).toHaveBeenCalledOnce();
  });

  it("returns a matching, unexpired answer cache", async () => {
    const now = Date.parse("2026-12-31T20:00:00.000Z");
    const value = JSON.stringify({ key: "key-1", answer: "Ga voor disco", spotifyMatches: [{ query: "disco", tracks: [] }] });
    const { db } = fakeDb({ first: { value, updated_at: "2026-12-31 19:55:00" } });
    await expect(readAssistantAnswerCache(db, "key-1", now)).resolves.toEqual({
      answer: "Ga voor disco",
      spotifyMatches: [{ query: "disco", tracks: [] }],
    });
  });

  it("misses on wrong keys, expired rows and malformed JSON", async () => {
    const now = Date.parse("2026-12-31T20:00:00.000Z");
    const wrongKey = fakeDb({ first: { value: '{"key":"other","answer":"x"}', updated_at: "2026-12-31 19:59:00" } });
    const expired = fakeDb({ first: { value: '{"key":"key-1","answer":"x"}', updated_at: "2026-12-31 19:40:00" } });
    const malformed = fakeDb({ first: { value: "{", updated_at: "2026-12-31 19:59:00" } });
    await expect(readAssistantAnswerCache(wrongKey.db, "key-1", now)).resolves.toBeNull();
    await expect(readAssistantAnswerCache(expired.db, "key-1", now)).resolves.toBeNull();
    await expect(readAssistantAnswerCache(malformed.db, "key-1", now)).resolves.toBeNull();
  });

  it("writes cache payload with its cache key", async () => {
    const { db, bind, run } = fakeDb();
    await writeAssistantAnswerCache(db, "key-2", "antwoord", []);
    expect(bind).toHaveBeenCalledWith(JSON.stringify({ key: "key-2", answer: "antwoord", spotifyMatches: [] }));
    expect(run).toHaveBeenCalledOnce();
  });

  it("claims the cooldown only when D1 reports a changed row", async () => {
    const allowed = fakeDb({ changes: 1 });
    const blocked = fakeDb({ changes: 0 });
    await expect(claimAssistantRateLimit(allowed.db)).resolves.toBe(true);
    await expect(claimAssistantRateLimit(blocked.db)).resolves.toBe(false);
  });
});
