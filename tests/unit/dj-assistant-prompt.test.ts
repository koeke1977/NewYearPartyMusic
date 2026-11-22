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
  partyQueue: {
    activity: { totalRequests: 3, uniqueTracksRequested: 3, pending: 1, approved: 0, queued: 1, played: 1, rejected: 0, failed: 0, topArtists: [{ artist: "Artist A", requests: 2 }] },
    queued: [{ track: "Track A — Artist A", durationMs: 210000 }],
    recentlyPlayed: [{ track: "Track B — Artist B", playedAt: "2026-12-31T20:00:00Z" }],
    audience: { respondents: 12, genres: [{ label: "disco", guests: 8, share: 0.6667 }], subgenres: [],
      decades: [{ label: "90s", guests: 6, share: 0.5 }], moods: [{ label: "feel-good", guests: 7, share: 0.5833 }], averageEnergy: 7.2 },
    crowdFeedback: { eligible: true, respondents: 8, windowMinutes: 30,
      atmosphere: { good: 6, neutral: 1, bad: 1 }, averageEnergy: 4.1, trend: "positive" },
  },
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
    expect(system).toContain("bounded snapshot of the current PartyQueue");
    expect(system).toContain("request lifecycle aggregates");
    expect(system).toContain("downstream playback view, not an independent source");
    expect(system).toContain("Do not claim UP NEXT, planned tracks or played history are unavailable when the corresponding PartyQueue information is present in context");
    expect(system).toContain("Treat the D1-backed PartyQueue as the single source of truth for requested, queued and played music");
    expect(system).toContain("Use the supplied eventMoment.phase as the event-phase source");
    expect(system).toContain("Do not add disclaimers that Spotify UP NEXT, the planned list or played history are unavailable");
    expect(system).not.toContain("This is not Spotify UP NEXT or live playback telemetry");
    expect(system).toContain("The D1-backed PartyQueue supplied in this context is the source of truth");
    expect(system).toContain("is only the downstream playback view of that same list, not an independent source or signal");
    expect(system).toContain("D1 lifecycle status and timestamps describe application state, not independent Spotify player telemetry");
    expect(system).toContain("Request volume is interest, not proof of enjoyment");
    expect(user).toContain("uniqueTracksRequested");
    expect(system).toContain("aggregate event-level audience preferences");
    expect(system).toContain("eligible aggregate crowd feedback");
    expect(system).toContain("Do not claim to have changed PartyQueue unless an action result is explicitly supplied after execution");
    expect(system).toContain("PartyQueue request names are not Spotify catalogue verification");
    expect(system).toContain("unverified suggestions");
    expect(user).toContain("LIVE PARTY CONTEXT");
    expect(user).toContain("Track A — Artist A");
    expect(user).toContain("Track B — Artist B");
    expect(user).toContain("respondents");
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
    expect(user).toContain("DJ QUESTION:\nMaak die lijst commerciëler");
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

  it("requires concrete ordered tracks for a timed DJ block, even when the queue may be empty", () => {
    const { system } = buildDJAssistantPrompt(context, "Stel een verrassend blok van 30 minuten voor.");
    expect(system).toContain("TIMED DJ BLOCK CONTRACT (MANDATORY FOR THIS REQUEST)");
    expect(system).toContain("6–8 concrete track suggestions");
    expect(system).toContain("deliberate play order");
    expect(system).toContain("If PartyQueue is empty");
    expect(system).toContain("Never substitute genre descriptions");
    expect(system).toContain("Do not add Spotify-access disclaimers");
  });

  it("does not add timed-block requirements to general non-timeboxed advice", () => {
    const { system } = buildDJAssistantPrompt(context, "Wat past hierna?");
    expect(system).not.toContain("TIMED DJ BLOCK CONTRACT");
  });

  it("requires exact-count numbered output when the DJ asks for twenty suggestions", () => {
    const { system } = buildDJAssistantPrompt(context, "Geef me 20 nummers.");
    expect(system).toContain("return exactly 20 concrete numbered ideas");
    expect(system).toContain("clearly state that these are unverified suggestions");
  });

  it("keeps DJ autonomy and never pressures the DJ to use earlier suggestions", () => {
    const { system } = buildDJAssistantPrompt(context, "Voeg die nummers toe aan Spotify");
    expect(system).toContain("suggestions are optional, never instructions or commitments");
    expect(system).toContain("Never assume the DJ accepted, selected or intends to use a previous suggestion or list");
    expect(system).toContain("Only the Worker may execute explicit, validated DJ actions through allow-listed application workflows");
    expect(system).toContain("let the DJ choose whether to reuse, change, ignore or replace previous ideas");
    expect(system).toContain("end with one short, natural offer that you can verify and add the chosen tracks to PartyQueue");
    expect(system).toContain("request the structured add_tracks action plan for the referenced tracks from the recent conversation");
    expect(system).not.toContain("ACTION PLANNER MODE");
    expect(system).toContain("does not add tracks to the DJ's personal Spotify playlist");
    expect(system).toContain("does not start, pause, skip or control playback");
    expect(system).not.toContain("the DJ must manually add");
  });

  it("does not inject manual Spotify instructions into ordinary music advice", () => {
    const { system } = buildDJAssistantPrompt(context, "Geef me 20 hete schuurschijven.");
    expect(system).toContain("Do not add a Spotify-access disclaimer to ordinary requests for music advice");
    expect(system).toContain("Do not tell the DJ they must manually add, search for or use the suggestions");
    expect(system).toContain("Mention the Spotify limitation only when the DJ explicitly asks you to perform an action");
    expect(system).toContain("do not tell the DJ to search for or manually add them");
  });

  it("does not claim audio analysis or measured BPM access", () => {
    const { system } = buildDJAssistantPrompt(context, "Analyseer de overgang.");
    expect(system).toContain("do not invent exact BPM, key or beatmatching claims");
    expect(system).toContain("Never claim to hear audio");
  });
  it("excludes tracks and artists suggested in recent AI lists from the next independent list", () => {
    const { system, user } = buildDJAssistantPrompt(context, "Maak een nieuwe lijst met andere nummers.", [
      { role: "user", content: "Geef me een lijst." },
      { role: "assistant", content: "September — Earth, Wind & Fire\\nLe Freak — Chic" },
      { role: "user", content: "Oké, maar niet telkens Earth, Wind & Fire." },
    ]);
    expect(system).toContain("cross-list suggestion history");
    expect(system).toContain("do NOT repeat any exact track already suggested");
    expect(system).toContain("actively avoid reusing the same artists");
    expect(system).toContain("A previous 'oké', acknowledgement or request to adjust a list does not reset this exclusion");
    expect(user).toContain("September — Earth, Wind & Fire");
    expect(user).toContain("not telkens Earth, Wind & Fire");
  });

});
