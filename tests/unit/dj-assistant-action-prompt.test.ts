import { describe, expect, it } from "vitest";
import { buildDJAssistantPrompt, type DJAssistantContext } from "../../apps/worker/src/modules/ai/prompts/dj-assistant";

const context: DJAssistantContext = {
  event: "Test Party",
  eventMoment: {
    belgianLocalTime: "2026-11-21 20:00",
    isNewYearsEve2026: false,
    minutesToMidnight: null,
    minutesAfterMidnight: null,
    phase: "rehearsal",
  },
  djPreferences: [],
  partyQueue: {
    activity: {
      totalRequests: 2, uniqueTracksRequested: 2, pending: 0, approved: 0,
      queued: 2, played: 0, rejected: 0, failed: 0, topArtists: [],
    },
    queued: [
      { id: "queue-a", track: "Track A — Artist A", durationMs: 180000 },
      { id: "queue-b", track: "Track B — Artist B", durationMs: 190000 },
    ],
    recentlyPlayed: [],
    audience: { respondents: 0, genres: [], subgenres: [], decades: [], moods: [], averageEnergy: null },
    crowdFeedback: {
      eligible: false, respondents: 0, windowMinutes: 30, atmosphere: null,
      averageEnergy: null, trend: "insufficient",
    },
  },
};

describe("DJ assistant action prompt", () => {
  it("exposes queue IDs and the bounded JSON action contract only in action mode", () => {
    const actionPrompt = buildDJAssistantPrompt(context, "Herschik de PartyQueue", [], true);
    expect(actionPrompt.system).toContain("ACTION PLANNER MODE");
    expect(actionPrompt.system).toContain("reorder_queue");
    expect(actionPrompt.user).toContain('"id":"queue-a"');
    expect(actionPrompt.user).toContain("Return the required JSON action plan");

    const advicePrompt = buildDJAssistantPrompt(context, "Geef me een verrassend setplan");
    expect(advicePrompt.system).not.toContain("ACTION PLANNER MODE");
    expect(advicePrompt.user).not.toContain("Return the required JSON action plan");
  });
});
