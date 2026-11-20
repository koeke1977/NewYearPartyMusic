import { describe, expect, it } from "vitest";
import { cleanupCompletedRequests } from "../../apps/worker/src/modules/requests/application/cleanup-completed-requests";

describe("completed request retention", () => {
  it("deletes only requests older than 30 days that are not live", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        let values: unknown[] = [];
        const statement = {
          bind(...args: unknown[]) { values = args; return statement; },
          async run() { calls.push({ sql, values: [...values] }); return { meta: { changes: 3 } }; },
        };
        return statement;
      },
    };
    await cleanupCompletedRequests(db as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("requested_at < datetime('now','-30 days')");
    expect(calls[0].sql).toContain("status NOT IN ('pending','approved','queued')");
  });
});
