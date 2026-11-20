import { describe, expect, it } from "vitest";
import { buildDJAssistantPrompt, type DJAssistantContext } from "../../apps/worker/src/modules/ai/prompts/dj-assistant";

const context: DJAssistantContext = {
  event: "New Year's Eve 2026",
  eventMoment: {
    belgianLocalTime: "2026-12-31 21:30 (rounded to 15 min)",
    isNewYearsEve2026: true,
    minutesToMidnight: 270,
    minutesAfterMidnight: null,
    phase: "building_toward_midnight",
  },
  djPreferences: ["stijlwissels zijn welkom", "disco en 90s"],
  acceptedSetHistory: [{ at: "2026-12-20T20:00:00.000Z", tracks: ["Track A — Artist A"] }],
  currentlyLastPlayed: "Track B — Artist B",
  upNext: ["Track C — Artist C [4 min]", "Track D — Artist D [3 min]"],
  recentPlayed: ["Track B — Artist B"],
  requestMix: { queued: 2, played: 1 },
};

describe("DJ assistant prompt", () => {
  it("explicitly allows deliberate genre and style changes", () => {
    const { system } = buildDJAssistantPrompt(context, "Maak een disco-blok.");
    expect(system).toContain("STYLE CHANGES ARE ALLOWED AND OFTEN DESIRABLE");
    expect(system).toContain("intentional drops and sudden lifts are valid");
    expect(system).toContain("smooth bridges when useful, but they are optional");
  });

  it("protects queue optimization from missing, duplicate or invented tracks", () => {
    const { system } = buildDJAssistantPrompt(context, "Optimaliseer UP NEXT.");
    expect(system).toContain("Each supplied entry must appear exactly once");
    expect(system).toContain("never duplicate a track, never omit a track");
    expect(system).toContain("never add a track that is not in upNext");
  });

  it("requires exact-count numbered output when the DJ asks for twenty tracks", () => {
    const { system } = buildDJAssistantPrompt(context, "Geef me 20 nummers.");
    expect(system).toContain("return exactly 20 concrete numbered tracks");
    expect(system).toContain("Never stop early");
  });

  it("includes the current structured PartyQueue context and the DJ question", () => {
    const { user } = buildDJAssistantPrompt(context, "Wat past hierna?");
    expect(user).toContain("PARTYQUEUE CONTEXT:");
    expect(user).toContain("New Year's Eve 2026");
    expect(user).toContain("building_toward_midnight");
    expect(user).toContain("stijlwissels zijn welkom");
    expect(user).toContain("Track C — Artist C [4 min]");
    expect(user).toContain("DJ QUESTION:\nWat past hierna?");
  });

  it("does not claim audio analysis or measured BPM access", () => {
    const { system } = buildDJAssistantPrompt(context, "Analyseer de overgang.");
    expect(system).toContain("Never invent exact BPM, key or beatmatching claims");
    expect(system).toContain("no audio analysis or measured tempo data is available");
    expect(system).toContain("Never claim to hear audio");
  });
});
