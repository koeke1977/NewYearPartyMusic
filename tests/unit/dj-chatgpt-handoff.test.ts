import { describe, expect, it } from "vitest";
import { buildDjChatGptPrompt } from "../../apps/web/modules/dj-chatgpt-handoff.js";

describe("DJ ChatGPT handoff prompt", () => {
  it("includes the current Spotify track and exact queued track order", () => {
    const prompt = buildDjChatGptPrompt({
      nowPlaying: "▶ NOW PLAYING · Track A — Artist A",
      queuedTracks: [
        { track_name: "Track B", artist_name: "Artist B" },
        { track_name: "Track C", artist_name: "Artist C" },
      ],
    });

    expect(prompt).toContain("▶ NOW PLAYING · Track A — Artist A");
    expect(prompt).toContain("UP NEXT (2 tracks):\n1. Track B — Artist B\n2. Track C — Artist C");
    expect(prompt).toContain("Voeg niets zelf toe aan Spotify of PartyQueue");
  });

  it("handles an empty queue and missing playback state", () => {
    const prompt = buildDjChatGptPrompt({ queuedTracks: null, nowPlaying: "" });

    expect(prompt).toContain("Niet beschikbaar");
    expect(prompt).toContain("UP NEXT (0 tracks):\n(UP NEXT is momenteel leeg)");
  });
});
