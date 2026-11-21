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

  it("includes only bounded prior DJ prompts and AI answers for follow-up resolution", () => {
    const { user, system } = buildDJAssistantPrompt(context, "Maak die lijst commerciëler", [
      { role: "user", content: "Maak een verrassende lijst." },
      { role: "assistant", content: "1. Music Sounds Better With You — Stardust" },
    ]);
    expect(user).toContain("RECENT DJ/AI CONVERSATION");
    expect(user).toContain("Music Sounds Better With You");
    expect(user).toContain("DJ QUESTION:\\nMaak die lijst commerciëler");
    expect(system).toContain("resolve references such as");
    expect(user).not.toContain("spotify_track_id");
    expect(user).not.toContain("album_image_url");
  });

  it("sets hard diversity targets for an explicitly surprising track list", () => {
    const { system } = buildDJAssistantPrompt(context, "Geef me een verrassende uiteenlopende lijst nummers.");
    expect(system).toContain("SURPRISE LIST CONTRACT (MANDATORY FOR THIS REQUEST)");
    expect(system).toContain("at least 6 meaningfully different genres");
    expect(system).toContain("at least 5 different decades");
    expect(system).toContain("at least 3 left-field");
    expect(system).toContain("Unless the DJ specifies another count, give 12 tracks");
  });

  it("does not impose surprise-list rules on an ordinary track list", () => {
    const { system } = buildDJAssistantPrompt(context, "Maak een lijst met bekende feestnummers.");
    expect(system).not.toContain("SURPRISE LIST CONTRACT");
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
