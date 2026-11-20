import { describe, expect, it } from "vitest";
import { buildDJAssistantContext, parseAcceptedSetHistory, parseSavedQueueOrder } from "../../apps/worker/src/modules/ai/context/assistant-context";
import { buildEventMoment } from "../../apps/worker/src/modules/ai/context/event-moment";

describe("DJ assistant context", () => {
  const eventMoment = buildEventMoment(new Date("2026-12-31T20:00:00.000Z"));

  it("uses the saved DJ queue order and retains each queued track once", () => {
    const context = buildDJAssistantContext({
      event: "NYE",
      eventMoment,
      djPreferences: ["genre changes welcome"],
      acceptedSetHistory: [],
      savedQueueOrder: ["b", "a"],
      tracks: [
        { id: "a", track_name: "Track A", artist_name: "Artist A", duration_ms: 180000, status: "queued", queued_at: "2026-12-31 20:01", requested_at: "2026-12-31 20:00" },
        { id: "b", track_name: "Track B", artist_name: "Artist B", duration_ms: 240000, status: "queued", queued_at: "2026-12-31 20:02", requested_at: "2026-12-31 20:00" },
        { id: "c", track_name: "Track C", artist_name: "Artist C", duration_ms: 200000, status: "pending", queued_at: null, requested_at: "2026-12-31 20:03" },
      ],
      playedTracks: [{ track_name: "Last", artist_name: "Artist" }],
      requestCounts: [{ status: "queued", count: 2 }, { status: "played", count: 1 }],
    });

    expect(context.upNext).toEqual(["Track B — Artist B [4 min]", "Track A — Artist A [3 min]"]);
    expect(context.currentlyLastPlayed).toBe("Last — Artist");
    expect(context.requestMix).toEqual({ queued: 2, played: 1 });
    expect(context.djPreferences).toEqual(["genre changes welcome"]);
  });

  it("falls back to queue timestamps for tracks absent from the saved order", () => {
    const context = buildDJAssistantContext({
      event: "NYE",
      eventMoment,
      djPreferences: [],
      acceptedSetHistory: [],
      savedQueueOrder: [],
      tracks: [
        { id: "later", track_name: "Later", artist_name: "Artist", duration_ms: null, status: "queued", queued_at: "2026-12-31 20:02", requested_at: "2026-12-31 20:00" },
        { id: "first", track_name: "First", artist_name: "Artist", duration_ms: 1000, status: "queued", queued_at: "2026-12-31 20:01", requested_at: "2026-12-31 20:00" },
      ],
      playedTracks: [],
      requestCounts: [],
    });
    expect(context.upNext).toEqual(["First — Artist [0 min]", "Later — Artist [0 min]"]);
    expect(context.currentlyLastPlayed).toBe("unknown");
  });

  it("parses persisted order and history defensively", () => {
    expect(parseSavedQueueOrder('["a",1,"b"]')).toEqual(["a", "b"]);
    expect(parseSavedQueueOrder("{broken")).toEqual([]);
    expect(parseAcceptedSetHistory('[{"at":"today","tracks":["one"]},{"bad":true}]')).toEqual([
      { at: "today", tracks: ["one"] },
    ]);
    expect(parseAcceptedSetHistory("not-json")).toEqual([]);
  });
});
