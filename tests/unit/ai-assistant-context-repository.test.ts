import { describe, expect, it, vi } from "vitest";
import { loadAssistantContextSnapshot } from "../../apps/worker/src/modules/ai/infrastructure/assistant-context-repository";

function fakeDb() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const values: unknown[] = [];
    const statement = {
      bind: (...args: unknown[]) => { values.push(...args); return statement; },
      all: async () => {
        calls.push({ sql, values: [...values] });
        return { results: [{ status: "queued", count: 2 }, { status: "played", count: 1 }] };
      },
      first: async () => {
        calls.push({ sql, values: [...values] });
        return { value: '["disco","90s"]' };
      },
    };
    return statement;
  });
  return { db: { prepare } as never, prepare, calls };
}

describe("AI assistant context repository", () => {
  it("loads only aggregate request counts and DJ-authored preferences", async () => {
    const { db, calls, prepare } = fakeDb();
    const snapshot = await loadAssistantContextSnapshot(db, "event-1");

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(snapshot).toEqual({
      requestCounts: [{ status: "queued", count: 2 }, { status: "played", count: 1 }],
      djPreferences: '["disco","90s"]',
    });
    expect(calls.every(call => !/track_name|artist_name|spotify|partyqueue_order|dj_ai_history/i.test(call.sql))).toBe(true);
    expect(calls.every(call => call.values[0] === "event-1" || call.values[0] === "dj_ai_profile_event-1")).toBe(true);
  });

  it("returns empty counts and null preferences when D1 has no rows", async () => {
    const prepare = vi.fn((sql: string) => {
      const statement = {
        bind: () => statement,
        all: async () => ({ results: [] }),
        first: async () => null,
      };
      return statement;
    });
    const snapshot = await loadAssistantContextSnapshot({ prepare } as never, "empty-event");
    expect(snapshot).toEqual({ requestCounts: [], djPreferences: null });
  });
});
