import { describe, expect, it, vi } from "vitest";
import { maybeAdvancePartyQueue, maybeStartSpotifyFallback } from "../../apps/worker/src/modules/playback/application/playback-automation";

function fakeDb(settings: Record<string, { value: string; updated_at?: string }> = {}, queued = 0, claimChanges = 1) {
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    let values: unknown[] = [];
    const statement = {
      bind: (...args: unknown[]) => { values = args; return statement; },
      first: async () => {
        if (sql.includes("COUNT(*)")) return { count: queued };
        const key = String(values[0] || "");
        return settings[key] || null;
      },
      run: async () => {
        writes.push({ sql, values: [...values] });
        if (sql.includes("spotify_fallback_active','starting'")) return { meta: { changes: claimChanges } };
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  });
  return { db: { prepare } as never, writes };
}
const last = (startedAt: number, durationMs = 180000) => JSON.stringify({
  uri: "spotify:track:last", durationMs, startedAt,
});

describe("queue advancement policy", () => {
  it("does not advance while Spotify is playing", async () => {
    const { db } = fakeDb();
    const dispatchNext = vi.fn();
    const result = await maybeAdvancePartyQueue({ db, eventId: "event", dispatchNext, startFallback: vi.fn() }, true);
    expect(result).toEqual({ advanced: false });
    expect(dispatchNext).not.toHaveBeenCalled();
  });

  it("respects manual pause even after the expected track duration", async () => {
    const { db } = fakeDb({
      spotify_manual_pause: { value: "true" },
      spotify_last_partyqueue_track: { value: last(1000) },
    }, 2);
    const dispatchNext = vi.fn();
    const result = await maybeAdvancePartyQueue({ db, eventId: "event", dispatchNext, startFallback: vi.fn(), now: () => 200000 }, false);
    expect(result).toEqual({ advanced: false });
    expect(dispatchNext).not.toHaveBeenCalled();
  });

  it("waits for the 2.5-second end tolerance and dispatches when due", async () => {
    const { db } = fakeDb({ spotify_last_partyqueue_track: { value: last(1000) } }, 1);
    const dispatchNext = vi.fn(async () => ({ ok: true }));
    const before = await maybeAdvancePartyQueue({ db, eventId: "event", dispatchNext, startFallback: vi.fn(), now: () => 178400 }, false);
    expect(before.advanced).toBe(false);
    const due = await maybeAdvancePartyQueue({ db, eventId: "event", dispatchNext, startFallback: vi.fn(), now: () => 178501 }, false);
    expect(due).toEqual({ advanced: true });
    expect(dispatchNext).toHaveBeenCalledTimes(1);
  });

  it("treats dispatch-lock contention as normal and surfaces real dispatch errors", async () => {
    const { db } = fakeDb({ spotify_last_partyqueue_track: { value: last(1000) } }, 1);
    const busy = await maybeAdvancePartyQueue({ db, eventId: "event", dispatchNext: async () => ({ ok: false, busy: true }), startFallback: vi.fn(), now: () => 200000 }, false);
    const failed = await maybeAdvancePartyQueue({ db, eventId: "event", dispatchNext: async () => ({ ok: false, error: "Spotify fout" }), startFallback: vi.fn(), now: () => 200000 }, false);
    expect(busy).toEqual({ advanced: false });
    expect(failed).toEqual({ advanced: false, error: "Spotify fout" });
  });

  it("ignores malformed persisted last-track state", async () => {
    const { db } = fakeDb({ spotify_last_partyqueue_track: { value: "{bad" } }, 1);
    const dispatchNext = vi.fn();
    const result = await maybeAdvancePartyQueue({ db, eventId: "event", dispatchNext, startFallback: vi.fn() }, false);
    expect(result).toEqual({ advanced: false });
    expect(dispatchNext).not.toHaveBeenCalled();
  });
});

describe("Spotify fallback policy", () => {
  it("does not start fallback during manual pause or while queued requests remain", async () => {
    const paused = fakeDb({
      spotify_manual_pause: { value: "true" },
      spotify_last_partyqueue_track: { value: last(1000) },
    });
    const startFallback = vi.fn();
    expect(await maybeStartSpotifyFallback({ db: paused.db, eventId: "event", dispatchNext: vi.fn(), startFallback, now: () => 200000 }, null, false)).toBe(false);
    const queued = fakeDb({ spotify_last_partyqueue_track: { value: last(1000) } }, 1);
    expect(await maybeStartSpotifyFallback({ db: queued.db, eventId: "event", dispatchNext: vi.fn(), startFallback, now: () => 200000 }, null, false)).toBe(false);
    expect(startFallback).not.toHaveBeenCalled();
  });

  it("honours active/starting states, retry delay and the 4-second finish tolerance", async () => {
    const now = 200000;
    const startFallback = vi.fn();
    const active = fakeDb({ spotify_fallback_active: { value: "true" } });
    expect(await maybeStartSpotifyFallback({ db: active.db, eventId: "event", dispatchNext: vi.fn(), startFallback, now: () => now }, null, false)).toBe(true);
    const starting = fakeDb({ spotify_fallback_active: { value: "starting", updated_at: "1970-01-01 00:03:19" } });
    expect(await maybeStartSpotifyFallback({ db: starting.db, eventId: "event", dispatchNext: vi.fn(), startFallback, now: () => now }, null, false)).toBe(false);
    const retry = fakeDb({
      spotify_fallback_retry_after: { value: String(now + 10000) },
      spotify_last_partyqueue_track: { value: last(1000) },
    });
    expect(await maybeStartSpotifyFallback({ db: retry.db, eventId: "event", dispatchNext: vi.fn(), startFallback, now: () => now }, null, false)).toBe(false);
    const tooEarly = fakeDb({ spotify_last_partyqueue_track: { value: last(1000) } });
    expect(await maybeStartSpotifyFallback({ db: tooEarly.db, eventId: "event", dispatchNext: vi.fn(), startFallback, now: () => 177000 }, null, false)).toBe(false);
    expect(startFallback).not.toHaveBeenCalled();
  });

  it("does not replace the same PartyQueue track while it is still playing", async () => {
    const { db } = fakeDb({ spotify_last_partyqueue_track: { value: last(1000) } });
    const startFallback = vi.fn();
    const result = await maybeStartSpotifyFallback({ db, eventId: "event", dispatchNext: vi.fn(), startFallback, now: () => 200000 }, "spotify:track:last", true);
    expect(result).toBe(false);
    expect(startFallback).not.toHaveBeenCalled();
  });

  it("claims fallback once, starts it and clears previous failure state", async () => {
    const { db, writes } = fakeDb({ spotify_last_partyqueue_track: { value: last(1000) } });
    const startFallback = vi.fn(async () => {});
    const result = await maybeStartSpotifyFallback({ db, eventId: "event", dispatchNext: vi.fn(), startFallback, now: () => 200000 }, null, false);
    expect(result).toBe(true);
    expect(startFallback).toHaveBeenCalledTimes(1);
    expect(writes.some(write => write.sql.includes("spotify_fallback_active','starting'"))).toBe(true);
    expect(writes.some(write => write.sql.includes("DELETE FROM settings WHERE key='spotify_fallback_retry_after'"))).toBe(true);
    expect(writes.some(write => write.sql.includes("DELETE FROM settings WHERE key='spotify_fallback_error'"))).toBe(true);
  });

  it("backs off for one minute and persists the Spotify error on failure", async () => {
    const { db, writes } = fakeDb({ spotify_last_partyqueue_track: { value: last(1000) } });
    const startFallback = vi.fn(async () => { throw new Error("Spotify offline"); });
    const result = await maybeStartSpotifyFallback({ db, eventId: "event", dispatchNext: vi.fn(), startFallback, now: () => 200000 }, null, false);
    expect(result).toBe(false);
    expect(writes.some(write => write.sql.includes("spotify_fallback_error") && write.values[0] === "Spotify offline")).toBe(true);
    expect(writes.some(write => write.sql.includes("spotify_fallback_active','false'"))).toBe(true);
    expect(writes.some(write => write.sql.includes("spotify_fallback_retry_after") && write.values[0] === "260000")).toBe(true);
  });

  it("does not start fallback if another status poll owns the start lease", async () => {
    const { db } = fakeDb({ spotify_last_partyqueue_track: { value: last(1000) } }, 0, 0);
    const startFallback = vi.fn();
    const result = await maybeStartSpotifyFallback({ db, eventId: "event", dispatchNext: vi.fn(), startFallback, now: () => 200000 }, null, false);
    expect(result).toBe(false);
    expect(startFallback).not.toHaveBeenCalled();
  });
});
