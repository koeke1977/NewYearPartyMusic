import { describe, expect, it, vi } from "vitest";
import { dispatchNextTrack } from "../../apps/worker/src/modules/queue/application/dispatch-next-track";

type Track = {
  id: string; track_uri: string; track_name: string; artist_name: string;
  duration_ms: number; queued_at: string; requested_at: string;
};

function fakeDb(options: {
  lockChanges?: number;
  queued?: Track[];
  order?: string;
  updateChanges?: number;
} = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    let values: unknown[] = [];
    const statement = {
      bind: (...args: unknown[]) => { values = args; return statement; },
      first: async () => {
        calls.push({ sql, values: [...values] });
        if (sql.includes("partyqueue_order")) return options.order === undefined ? { value: '[]' } : { value: options.order };
        return null;
      },
      all: async () => {
        calls.push({ sql, values: [...values] });
        return { results: options.queued || [] };
      },
      run: async () => {
        calls.push({ sql, values: [...values] });
        if (sql.includes("spotify_partyqueue_next_lock") && sql.startsWith("INSERT")) return { meta: { changes: options.lockChanges ?? 1 } };
        if (sql.startsWith("UPDATE requests")) return { meta: { changes: options.updateChanges ?? 1 } };
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  });
  return { db: { prepare } as never, calls };
}

const track = (id: string, queuedAt = "2026-11-20 10:00:00"): Track => ({
  id, track_uri: "spotify:track:" + id, track_name: "Song " + id,
  artist_name: "Artist", duration_ms: 180000, queued_at: queuedAt, requested_at: queuedAt,
});

describe("dispatchNextTrack", () => {
  it("does not call Spotify or release a lock it did not acquire", async () => {
    const { db, calls } = fakeDb({ lockChanges: 0 });
    const playTrack = vi.fn();
    const result = await dispatchNextTrack({ db, eventId: "event-1", playTrack, createOwner: () => "owner-1" });
    expect(result).toMatchObject({ ok: false, busy: true });
    expect(playTrack).not.toHaveBeenCalled();
    expect(calls.some(call => call.sql.startsWith("DELETE FROM settings"))).toBe(false);
  });

  it("releases the acquired lock when the queue is empty", async () => {
    const { db, calls } = fakeDb({ queued: [] });
    const result = await dispatchNextTrack({ db, eventId: "event-1", playTrack: vi.fn(), createOwner: () => "owner-2" });
    expect(result).toMatchObject({ ok: false, error: "Er staan geen PartyQueue-aanvragen klaar." });
    expect(calls.some(call => call.sql.startsWith("DELETE FROM settings") && call.values[0] === "owner-2")).toBe(true);
  });

  it("dispatches the saved first track and persists playback state before releasing the lock", async () => {
    const { db, calls } = fakeDb({ queued: [track("first"), track("second")], order: '["second","first"]' });
    const playTrack = vi.fn(async () => ({ ok: true, status: 204 }));
    const result = await dispatchNextTrack({
      db, eventId: "event-1", playTrack, createOwner: () => "owner-3", now: () => 123456,
    });
    expect(result).toEqual({ ok: true, track: { name: "Song second", artist: "Artist" }, requestId: "second" });
    expect(playTrack).toHaveBeenCalledWith("spotify:track:second");
    const updateIndex = calls.findIndex(call => call.sql.startsWith("UPDATE requests"));
    const fallbackIndex = calls.findIndex(call => call.sql.includes("spotify_fallback_active"));
    const lastTrackIndex = calls.findIndex(call => call.sql.includes("spotify_last_partyqueue_track"));
    const releaseIndex = calls.findIndex(call => call.sql.startsWith("DELETE FROM settings"));
    expect(updateIndex).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(updateIndex);
    expect(lastTrackIndex).toBeGreaterThan(fallbackIndex);
    expect(releaseIndex).toBeGreaterThan(lastTrackIndex);
    expect(JSON.parse(calls[lastTrackIndex].values[0] as string)).toEqual({
      uri: "spotify:track:second", durationMs: 180000, startedAt: 123456,
    });
  });

  it("does not mark a request played when Spotify rejects playback and still releases the lock", async () => {
    const { db, calls } = fakeDb({ queued: [track("failed")] });
    const result = await dispatchNextTrack({
      db, eventId: "event-1", playTrack: async () => ({ ok: false, status: 502 }), createOwner: () => "owner-4",
    });
    expect(result).toMatchObject({ ok: false, error: "Spotify kon het volgende nummer niet starten (HTTP 502)." });
    expect(calls.some(call => call.sql.startsWith("UPDATE requests"))).toBe(false);
    expect(calls.some(call => call.sql.startsWith("DELETE FROM settings") && call.values[0] === "owner-4")).toBe(true);
  });

  it("reports a concurrent request-state change after Spotify starts and releases the lock", async () => {
    const { db, calls } = fakeDb({ queued: [track("raced")], updateChanges: 0 });
    const result = await dispatchNextTrack({
      db, eventId: "event-1", playTrack: async () => ({ ok: true, status: 204 }), createOwner: () => "owner-5",
    });
    expect(result).toMatchObject({ ok: false, error: "De aanvraag is intussen gewijzigd; probeer opnieuw." });
    expect(calls.some(call => call.sql.includes("spotify_last_partyqueue_track"))).toBe(false);
    expect(calls.some(call => call.sql.startsWith("DELETE FROM settings") && call.values[0] === "owner-5")).toBe(true);
  });
});
