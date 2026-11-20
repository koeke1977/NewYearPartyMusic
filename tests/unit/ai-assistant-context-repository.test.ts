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
        if (sql.includes("status='played'")) return { results: [{ track_name: "Played", artist_name: "Artist" }] };
        if (sql.includes("COUNT(*)")) return { results: [{ status: "queued", count: 2 }] };
        if (sql.includes("FROM requests")) return { results: [{ id: "q1", track_name: "Queued", artist_name: "Artist", duration_ms: 180000, status: "queued", queued_at: null, requested_at: "2026-12-31 20:00:00" }] };
        return { results: [] };
      },
      first: async () => {
        calls.push({ sql, values: [...values] });
        if (sql.includes("partyqueue_order")) return { value: '["q1"]' };
        if (values[0] === "dj_ai_profile_event-1") return { value: '["disco"]' };
        if (values[0] === "dj_ai_history_event-1") return { value: '[{"at":"20:00","tracks":["Track"]}]' };
        return null;
      },
    };
    return statement;
  });
  return { db: { prepare } as never, prepare, calls };
}

describe("AI assistant context repository", () => {
  it("loads bounded event-scoped queue, history and settings in parallel", async () => {
    const { db, calls, prepare } = fakeDb();
    const snapshot = await loadAssistantContextSnapshot(db, "event-1");
    expect(prepare).toHaveBeenCalledTimes(6);
    expect(snapshot.queue).toHaveLength(1);
    expect(snapshot.playedTracks[0].track_name).toBe("Played");
    expect(snapshot.requestCounts).toEqual([{ status: "queued", count: 2 }]);
    expect(snapshot.savedQueueOrder).toBe('["q1"]');
    expect(snapshot.djPreferences).toBe('["disco"]');
    expect(snapshot.acceptedSetHistory).toContain("Track");
    expect(calls.find(call => call.sql.includes("FROM requests"))?.values).toEqual(["event-1"]);
    expect(calls.find(call => call.sql.includes("LIMIT 100"))?.sql).toContain("LIMIT 100");
    expect(calls.find(call => call.sql.includes("LIMIT 8"))?.sql).toContain("LIMIT 8");
  });

  it("returns empty collections and null settings when D1 has no rows", async () => {
    const prepare = vi.fn((sql: string) => {
      const statement = {
        bind: () => statement,
        all: async () => ({ results: [] }),
        first: async () => null,
      };
      return statement;
    });
    const snapshot = await loadAssistantContextSnapshot({ prepare } as never, "empty-event");
    expect(snapshot).toEqual({
      queue: [], playedTracks: [], requestCounts: [],
      savedQueueOrder: null, djPreferences: null, acceptedSetHistory: null,
    });
  });
});
