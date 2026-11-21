import { describe, expect, it } from "vitest";
import { buildDJAssistantContext } from "../../apps/worker/src/modules/ai/context/assistant-context";
import { buildEventMoment } from "../../apps/worker/src/modules/ai/context/event-moment";

const partyQueue = {
  queued: [{ track: "Track A — Artist A", durationMs: 200000 }],
  recentlyPlayed: [{ track: "Track B — Artist B", playedAt: null }],
  audience: { respondents: 0, genres: [], subgenres: [], decades: [], moods: [], averageEnergy: null },
  crowdFeedback: { eligible: false, respondents: 0, windowMinutes: 30, atmosphere: null, averageEnergy: null, trend: "insufficient" as const },
};

describe("DJ assistant context", () => {
  it("contains bounded event, queue and aggregate audience context", () => {
    const context = buildDJAssistantContext({
      event: "NYE",
      eventMoment: buildEventMoment(new Date("2026-12-31T20:00:00.000Z")),
      djPreferences: ["genre changes welcome", "disco and 90s"],
      partyQueue,
    });
    expect(context.event).toBe("NYE");
    expect(context.djPreferences).toEqual(["genre changes welcome", "disco and 90s"]);
    expect(context.partyQueue.queued[0].track).toBe("Track A — Artist A");
    expect(context.partyQueue.recentlyPlayed[0].track).toBe("Track B — Artist B");
    expect(context.partyQueue.crowdFeedback.trend).toBe("insufficient");
    expect(Object.keys(context).sort()).toEqual(["djPreferences", "event", "eventMoment", "partyQueue"]);
    expect(JSON.stringify(context)).not.toMatch(/guest_id|nickname|spotify_access_token/i);
  });
});
