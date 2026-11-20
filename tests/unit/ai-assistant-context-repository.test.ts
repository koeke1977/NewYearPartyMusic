import { describe, expect, it, vi } from "vitest";
import { loadAssistantContextSnapshot } from "../../apps/worker/src/modules/ai/infrastructure/assistant-context-repository";

describe("AI assistant context repository", () => {
  it("loads only DJ-authored preferences and never queries request or Spotify data", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const prepare = vi.fn((sql: string) => {
      const values: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => { values.push(...args); return statement; },
        async first() {
          calls.push({ sql, values: [...values] });
          return { value: '["disco","90s"]' };
        },
      };
      return statement;
    });
    const snapshot = await loadAssistantContextSnapshot({ prepare } as never, "event-1");
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(snapshot).toEqual({ djPreferences: '["disco","90s"]' });
    expect(calls[0].sql).toBe("SELECT value FROM settings WHERE key=?");
    expect(calls[0].values).toEqual(["dj_ai_profile_event-1"]);
    expect(calls.every(call => !/requests|track_name|artist_name|spotify|queue|playback/i.test(call.sql))).toBe(true);
  });

  it("returns null preferences when D1 has no DJ profile", async () => {
    const prepare = vi.fn((sql: string) => {
      const statement = { bind: () => statement, first: async () => null };
      return statement;
    });
    const snapshot = await loadAssistantContextSnapshot({ prepare } as never, "empty-event");
    expect(snapshot).toEqual({ djPreferences: null });
  });
});
