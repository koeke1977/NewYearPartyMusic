import { describe, expect, it } from "vitest";
import { getDjOverview, reorderDjQueue, updateDjSetting } from "../../apps/worker/src/modules/requests/application/dj-queue-management";
import { createDjQueueRepository } from "../../apps/worker/src/modules/requests/infrastructure/dj-queue-d1-repository";

type StatementCall = { sql: string; values: unknown[] };
function fakeDb(options: {
  active?: Array<Record<string, unknown>>;
  played?: Array<Record<string, unknown>>;
  settings?: Array<{ key: string; value: string }>;
  queuedIds?: string[];
  tracks?: Array<{ id: string; track_name: string; artist_name: string }>;
  history?: string | null;
} = {}) {
  const calls: StatementCall[] = [];
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) { values = args; return statement; },
        async all() {
          calls.push({ sql, values: [...values] });
          if (sql.includes("status IN ('pending','approved','queued')")) return { results: options.active || [] };
          if (sql.includes("status = 'played'")) return { results: options.played || [] };
          if (sql.includes("FROM settings WHERE key IN")) return { results: options.settings || [] };
          if (sql.includes("SELECT id FROM requests")) return { results: (options.queuedIds || []).map(id => ({ id })) };
          if (sql.includes("SELECT id,track_name,artist_name")) return { results: options.tracks || [] };
          return { results: [] };
        },
        async first() {
          calls.push({ sql, values: [...values] });
          if (sql.includes("SELECT value FROM settings WHERE key=?")) return options.history == null ? null : { value: options.history };
          return null;
        },
        async run() { calls.push({ sql, values: [...values] }); return { meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
  return { db: db as never, calls };
}

const request = (id: string, status: string, requestedAt: string, queuedAt: string | null = null) => ({
  id, spotify_track_id: id, track_uri: "spotify:track:" + id, track_name: "Song " + id,
  artist_name: "Artist", album_image_url: null, duration_ms: 180000, status,
  moderation_reason: null, requested_at: requestedAt, queued_at: queuedAt, nickname: "Guest",
});

describe("DJ queue management", () => {
  it("builds overview with status ranking, saved queue order and normalized settings", async () => {
    const { db } = fakeDb({
      active: [
        request("q1", "queued", "2026-11-20 10:00:00", "2026-11-20 10:02:00"),
        request("p1", "pending", "2026-11-20 10:01:00"),
        request("q2", "queued", "2026-11-20 10:03:00", "2026-11-20 10:03:00"),
        request("a1", "approved", "2026-11-20 10:04:00"),
      ],
      played: [request("done", "played", "2026-11-20 09:00:00")],
      settings: [
        { key: "partyqueue_order", value: '["q2","stale"]' },
        { key: "requests_paused", value: "true" },
        { key: "auto_approve", value: "false" },
        { key: "auto_queue", value: "true" },
        { key: "ai_autopilot", value: "true" },
      ],
    });
    const result = await getDjOverview({ repository: createDjQueueRepository(db), eventId: "event-1" });
    expect((result.requests as Array<{ id: string }>).map(row => row.id)).toEqual(["p1", "a1", "q2", "q1", "done"]);
    expect(result.queueOrder).toEqual(["q2", "q1"]);
    expect(result.settings).toEqual({ requestsPaused: true, autoApprove: false, autoQueue: true, aiAutopilot: true });
  });

  it("normalizes malformed saved order rather than failing the overview", async () => {
    const { db } = fakeDb({ active: [request("q1", "queued", "2026-11-20", "2026-11-20")], settings: [{ key: "partyqueue_order", value: "{bad" }] });
    const result = await getDjOverview({ repository: createDjQueueRepository(db), eventId: "event-1" });
    expect(result.queueOrder).toEqual(["q1"]);
  });

  it("persists exact event-scoped queue order and records the accepted set", async () => {
    const { db, calls } = fakeDb({
      queuedIds: ["a", "b"],
      tracks: [{ id: "a", track_name: "First", artist_name: "One" }, { id: "b", track_name: "Second", artist_name: "Two" }],
      history: '[{"at":"old","tracks":["Old — Artist"]}]',
    });
    const result = await reorderDjQueue({ repository: createDjQueueRepository(db), eventId: "event-1", order: ["b", "a"], nowIso: () => "2026-11-20T10:00:00.000Z" });
    expect(result).toEqual({ ok: true, value: { order: ["b", "a"] } });
    const orderWrite = calls.find(call => call.sql.includes("partyqueue_order") && call.sql.startsWith("INSERT"));
    expect(JSON.parse(orderWrite?.values[0] as string)).toEqual(["b", "a"]);
    const historyWrite = calls.find(call => call.sql.startsWith("INSERT INTO settings") && call.values[0] === "dj_ai_history_event-1");
    expect(JSON.parse(historyWrite?.values[1] as string)).toEqual([
      { at: "old", tracks: ["Old — Artist"] },
      { at: "2026-11-20T10:00:00.000Z", tracks: ["Second — Two", "First — One"] },
    ]);
  });

  it("rejects duplicates, omissions, foreign IDs and malformed input without writing", async () => {
    const cases: unknown[] = [["a", "a"], ["a"], ["a", "foreign"], "not-an-array", [1, "b"], new Array(101).fill("a")];
    for (const order of cases) {
      const { db, calls } = fakeDb({ queuedIds: ["a", "b"], tracks: [{ id: "a", track_name: "A", artist_name: "X" }, { id: "b", track_name: "B", artist_name: "Y" }] });
      const result = await reorderDjQueue({ repository: createDjQueueRepository(db), eventId: "event-1", order });
      expect(result).toMatchObject({ ok: false, error: { code: order === "not-an-array" || (Array.isArray(order) && (order.length > 100 || !order.every(item => typeof item === "string"))) ? "invalid_order" : "queue_changed" } });
      expect(calls.some(call => call.sql.startsWith("INSERT INTO settings"))).toBe(false);
    }
  });

  it("rechecks the queued set before persisting if a request changes during the reads", async () => {
    const { db, calls } = fakeDb({ queuedIds: ["a", "b"], tracks: [{ id: "a", track_name: "A", artist_name: "X" }] });
    const result = await reorderDjQueue({ repository: createDjQueueRepository(db), eventId: "event-1", order: ["a", "b"] });
    expect(result).toMatchObject({ ok: false, error: { code: "queue_changed" } });
    expect(calls.some(call => call.sql.startsWith("INSERT INTO settings"))).toBe(false);
  });

  it("validates setting allow-list and boolean value before writing", async () => {
    const { db, calls } = fakeDb();
    expect(await updateDjSetting({ repository: createDjQueueRepository(db), key: "spotify_client_secret", enabled: true })).toMatchObject({ ok: false, error: { code: "unknown_setting" } });
    expect(await updateDjSetting({ repository: createDjQueueRepository(db), key: "auto_queue", enabled: "true" })).toMatchObject({ ok: false, error: { code: "invalid_setting_value" } });
    expect(await updateDjSetting({ repository: createDjQueueRepository(db), key: "auto_queue", enabled: false })).toEqual({ ok: true, value: { enabled: false } });
    expect(await updateDjSetting({ repository: createDjQueueRepository(db), key: "ai_autopilot", enabled: true })).toEqual({ ok: true, value: { enabled: true } });
    const write = calls.find(call => call.sql.startsWith("INSERT INTO settings"));
    expect(write?.values).toEqual(["auto_queue", "false"]);
  });
});
