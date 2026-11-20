import { describe, expect, it, vi } from "vitest";
import {
  consumeAuthAttempt, deleteExpiredAuthAttemptBuckets,
} from "../../apps/worker/src/modules/identity/infrastructure/auth-attempt-d1-repository";

function fakeDb(returned: { attempt_count: number } | null = { attempt_count: 1 }) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) { values = args; return statement; },
        async first() { calls.push({ sql, values: [...values] }); return returned; },
        async run() { calls.push({ sql, values: [...values] }); return { meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
  return { db: db as never, calls };
}

describe("D1 auth attempt throttling", () => {
  it("atomically consumes an attempt and stores only a scoped IP hash", async () => {
    const { db, calls } = fakeDb();
    expect(await consumeAuthAttempt(db, "guest_join", "opaque-ip-hash", 120, 900)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("ON CONFLICT(scope,ip_hash) DO UPDATE");
    expect(calls[0].sql).toContain("RETURNING attempt_count");
    expect(calls[0].values).toEqual(["guest_join", "opaque-ip-hash", "-900 seconds", "-900 seconds", "-900 seconds", 120]);
  });

  it("denies attempts after the bucket threshold is reached", async () => {
    const { db } = fakeDb(null);
    expect(await consumeAuthAttempt(db, "dj_login", "opaque-ip-hash", 10, 900)).toBe(false);
  });

  it("removes expired IP buckets during scheduled cleanup", async () => {
    const { db, calls } = fakeDb();
    await deleteExpiredAuthAttemptBuckets(db);
    expect(calls[0].sql).toContain("DELETE FROM auth_attempt_buckets");
    expect(calls[0].sql).toContain("datetime('now','-1 day')");
  });
});
