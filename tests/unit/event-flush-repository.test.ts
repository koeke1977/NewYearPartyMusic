import { describe, expect, it, vi } from "vitest";
import { createEventFlushRepository } from "../../apps/worker/src/modules/events/infrastructure/event-flush-d1-repository";

describe("event flush D1 repository", () => {
  it("deletes only event-owned and derived temporary state in one D1 batch", async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            statements.push({ sql, values });
            return { sql, values };
          },
        };
      },
      batch: vi.fn(async (batch: Array<{ sql: string; values: unknown[] }>) => {
        expect(batch).toHaveLength(6);
        return [];
      }),
    } as unknown as D1Database;

    await createEventFlushRepository(db).flushTemporaryEventData("NYE2026");

    expect(db.batch).toHaveBeenCalledOnce();
    expect(statements[0].sql).toContain("DELETE FROM guests WHERE event_id = ?");
    expect(statements[0].values).toEqual(["NYE2026"]);
    expect(statements[1].sql).toContain("DELETE FROM dj_ai_turns WHERE event_id = ?");
    expect(statements[1].values).toEqual(["NYE2026"]);
    expect(statements[2].sql).toContain("DELETE FROM settings WHERE key = ?");
    expect(statements[2].values).toEqual(["partyqueue_order"]);
    expect(statements[3].values).toEqual(["dj_ai_history_NYE2026"]);
    expect(statements[4].sql).toContain("dj_ai_answer_cache");
    expect(statements[5].sql).toContain("spotify_last_partyqueue_track");
    expect(statements.some(statement => /spotify_auth|dj_ai_profile|auto_approve|requests_paused/.test(statement.sql))).toBe(false);
  });
});
