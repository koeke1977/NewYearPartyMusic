import { describe, expect, it } from "vitest";
import { buildDJAssistantContext } from "../../apps/worker/src/modules/ai/context/assistant-context";
import { buildEventMoment } from "../../apps/worker/src/modules/ai/context/event-moment";

describe("DJ assistant context", () => {
  it("contains only event timing, DJ-authored preferences and aggregate request counts", () => {
    const context = buildDJAssistantContext({
      event: "NYE",
      eventMoment: buildEventMoment(new Date("2026-12-31T20:00:00.000Z")),
      djPreferences: ["genre changes welcome", "disco and 90s"],
      requestCounts: [{ status: "queued", count: 2 }, { status: "played", count: 1 }],
    });

    expect(context.event).toBe("NYE");
    expect(context.djPreferences).toEqual(["genre changes welcome", "disco and 90s"]);
    expect(context.requestMix).toEqual({ queued: 2, played: 1 });
    expect(Object.keys(context).sort()).toEqual(["djPreferences", "event", "eventMoment", "requestMix"]);
    expect(JSON.stringify(context)).not.toContain("track_name");
    expect(JSON.stringify(context)).not.toContain("artist_name");
  });
});
