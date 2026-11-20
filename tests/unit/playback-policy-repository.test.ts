import { describe, expect, it } from "vitest";
import {
  claimSpotifyFallbackStart,
  clearSpotifyFallbackFailure,
  readPlaybackSetting,
  readQueuedRequestCount,
  readSpotifyFallbackError,
  setSpotifyFallbackActive,
  setSpotifyFallbackError,
  setSpotifyFallbackRetryAfter,
  setSpotifyFallbackState,
  setSpotifyManualPause,
} from "../../apps/worker/src/modules/playback/infrastructure/playback-policy-repository";

function fakeDb() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) { values = args; return statement; },
        async first() {
          calls.push({ sql, values: [...values] });
          if (sql.includes("COUNT(*)")) return { count: 3 };
          if (sql.includes("spotify_fallback_error")) return { value: "Spotify offline" };
          if (sql.includes("SELECT value,updated_at")) return { value: "true", updated_at: "2026-11-20 10:00:00" };
          return null;
        },
        async run() {
          calls.push({ sql, values: [...values] });
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements: unknown[]) {
      calls.push({ sql: "BATCH", values: statements });
      return [];
    },
  };
  return { db: db as never, calls };
}

describe("playback policy repository", () => {
  it("reads playback state and event-scoped queued count", async () => {
    const { db, calls } = fakeDb();
    expect(await readPlaybackSetting(db, "spotify_manual_pause")).toMatchObject({ value: "true" });
    expect(await readQueuedRequestCount(db, "event-1")).toBe(3);
    expect(calls[0].values).toEqual(["spotify_manual_pause"]);
    expect(calls[1].values).toEqual(["event-1"]);
    expect(calls[1].sql).toContain("event_id=? AND status='queued'");
  });

  it("uses an atomic fallback-start lease and exposes whether it was claimed", async () => {
    const { db, calls } = fakeDb();
    expect(await claimSpotifyFallbackStart(db)).toBe(true);
    expect(calls[0].sql).toContain("ON CONFLICT(key) DO UPDATE");
    expect(calls[0].sql).toContain("settings.updated_at < datetime('now','-60 seconds')");
    expect(calls[0].sql).toContain("settings.value!='true'");
  });

  it("persists fallback state, errors and retry timestamp", async () => {
    const { db, calls } = fakeDb();
    await setSpotifyFallbackState(db, "false");
    await setSpotifyFallbackActive(db);
    await setSpotifyFallbackError(db, "Spotify offline");
    await setSpotifyFallbackRetryAfter(db, 123456);
    expect(calls.map(call => call.values)).toEqual([[], [], ["Spotify offline"], ["123456"]]);
    expect(calls[0].sql).toContain("'spotify_fallback_active'");
    expect(calls[1].sql).toContain("'spotify_fallback_active'");
    expect(calls[2].sql).toContain("'spotify_fallback_error'");
    expect(calls[3].sql).toContain("'spotify_fallback_retry_after'");
  });

  it("reads fallback errors and updates manual pause as a boolean string", async () => {
    const { db, calls } = fakeDb();
    expect(await readSpotifyFallbackError(db)).toBe("Spotify offline");
    await setSpotifyManualPause(db, true);
    await setSpotifyManualPause(db, false);
    expect(calls.slice(1).map(call => call.values)).toEqual([["true"], ["false"]]);
  });

  it("clears both retry and error state together", async () => {
    const { db, calls } = fakeDb();
    await clearSpotifyFallbackFailure(db);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toBe("BATCH");
    expect(calls[0].values).toHaveLength(2);
  });
});
