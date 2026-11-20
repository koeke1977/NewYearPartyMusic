import { describe, expect, it, vi } from "vitest";
import { bindDjChatGptHandoff, buildDjChatGptPrompt } from "../../apps/web/modules/dj-chatgpt-handoff.js";

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


describe("DJ ChatGPT handoff controller", () => {
  it("opens regular ChatGPT and copies the current ordered queue", async () => {
    const handlers = {};
    const button = {
      disabled: false,
      addEventListener: (name, handler) => { handlers[name] = handler; },
    };
    const output = { textContent: "" };
    const openWindow = vi.fn();
    const clipboard = { writeText: vi.fn(async () => {}) };
    bindDjChatGptHandoff({
      button,
      getOverview: () => ({
        requests: [
          { id: "a", status: "queued", track_name: "Track A", artist_name: "Artist A" },
          { id: "b", status: "queued", track_name: "Track B", artist_name: "Artist B" },
        ],
        queueOrder: ["b", "a"],
      }),
      getNowPlaying: () => "Track live",
      output,
      openWindow,
      clipboard,
    });

    await handlers.click();

    expect(openWindow).toHaveBeenCalledWith("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("1. Track B — Artist B"));
    expect(output.textContent).toContain("gekopieerd");
    expect(button.disabled).toBe(false);
  });

  it("shows a helpful message when the DJ overview is not loaded", async () => {
    const handlers = {};
    const output = { textContent: "" };
    bindDjChatGptHandoff({
      button: { addEventListener: (name, handler) => { handlers[name] = handler; } },
      getOverview: () => null,
      getNowPlaying: () => "",
      output,
      openWindow: vi.fn(),
      clipboard: { writeText: vi.fn() },
    });

    await handlers.click();

    expect(output.textContent).toContain("nog niet geladen");
  });
});
