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
};

describe("DJ assistant prompt", () => {
  it("allows deliberate genre and energy changes", () => {
    const { system } = buildDJAssistantPrompt(context, "Maak een disco-blok.");
    expect(system).toContain("STYLE CHANGES ARE ALLOWED AND OFTEN DESIRABLE");
    expect(system).toContain("intentional drops and sudden lifts are valid");
    expect(system).toContain("smooth bridges when useful, but they are optional");
  });

  it("states the strict Spotify and usage-metric boundary", () => {
    const { system, user } = buildDJAssistantPrompt(context, "Wat past hierna?");
    expect(system).toContain("no Spotify catalogue, track metadata, cover art, playback state, live queue, request data, request counts or usage metrics");
    expect(system).toContain("Do not generate a numbered queue order");
    expect(system).toContain("unverified suggestions");
    expect(user).toContain("PARTYQUEUE NON-SPOTIFY CONTEXT:");
    expect(user).toContain("New Year's Eve 2026");
    expect(user).toContain("building_toward_midnight");
    expect(user).toContain("stijlwissels zijn welkom");
    expect(user).not.toContain("requestMix");
    expect(user).not.toContain("Track C");
    expect(user).not.toContain("Artist C");
  });

  it("requires exact-count numbered output when the DJ asks for twenty suggestions", () => {
    const { system } = buildDJAssistantPrompt(context, "Geef me 20 nummers.");
    expect(system).toContain("return exactly 20 concrete numbered ideas");
    expect(system).toContain("clearly state that these are unverified suggestions");
  });

  it("does not claim audio analysis or measured BPM access", () => {
    const { system } = buildDJAssistantPrompt(context, "Analyseer de overgang.");
    expect(system).toContain("do not invent exact BPM, key or beatmatching claims");
    expect(system).toContain("Never claim to hear audio");
  });
});
