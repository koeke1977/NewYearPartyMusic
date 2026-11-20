import { describe, expect, it } from "vitest";
import { buildDJAssistantContext } from "../../apps/worker/src/modules/ai/context/assistant-context";
import { buildEventMoment } from "../../apps/worker/src/modules/ai/context/event-moment";

describe("DJ assistant context", () => {
  it("contains only event timing and DJ-authored preferences", () => {
    const context = buildDJAssistantContext({
      event: "NYE",
      eventMoment: buildEventMoment(new Date("2026-12-31T20:00:00.000Z")),
      djPreferences: ["genre changes welcome", "disco and 90s"],
    });

    expect(context.event).toBe("NYE");
    expect(context.djPreferences).toEqual(["genre changes welcome", "disco and 90s"]);
    expect(Object.keys(context).sort()).toEqual(["djPreferences", "event", "eventMoment"]);
    expect(JSON.stringify(context)).not.toMatch(/track_name|artist_name|spotify|request|queue|playback/i);
  });
});
