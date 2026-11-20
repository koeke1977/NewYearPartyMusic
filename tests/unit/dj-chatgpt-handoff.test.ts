import { describe, expect, it, vi } from "vitest";
import { bindDjChatGptHandoff, buildDjChatGptPrompt } from "../../apps/web/modules/dj-chatgpt-handoff.js";

describe("DJ ChatGPT handoff prompt", () => {
  it("includes only event timing, DJ preferences and aggregate request counts", () => {
    const prompt = buildDjChatGptPrompt({
      eventName: "New Year's Eve 2026",
      localTime: "31 dec 2026 21:30",
      djPreferences: ["disco", "90s"],
      requestCounts: { queued: 2, pending: 1 },
    });

    expect(prompt).toContain("New Year's Eve 2026");
    expect(prompt).toContain("31 dec 2026 21:30");
    expect(prompt).toContain("queued: 2, pending: 1");
    expect(prompt).toContain("Spotify-trackmetadata, artiesten, albumhoezen");
    expect(prompt).not.toContain("Track A");
    expect(prompt).not.toContain("Artist A");
  });

  it("handles empty aggregate context without inventing a queue state", () => {
    const prompt = buildDjChatGptPrompt({ requestCounts: {} });
    expect(prompt).toContain("AANTALLEN AANVRAGEN PER STATUS: geen aanvragen");
    expect(prompt).toContain("live wachtrij en playbackstatus zijn bewust niet meegestuurd");
  });
});

describe("DJ ChatGPT handoff controller", () => {
  it("opens regular ChatGPT and copies aggregate context without Spotify metadata", async () => {
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
      }),
      getLocalTime: () => "21:30",
      output,
      openWindow,
      clipboard,
    });

    await handlers.click();

    expect(openWindow).toHaveBeenCalledWith("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    const prompt = clipboard.writeText.mock.calls[0][0];
    expect(prompt).toContain("queued: 2");
    expect(prompt).not.toContain("Track A");
    expect(prompt).not.toContain("Artist B");
    expect(output.textContent).toContain("geen Spotify-trackmetadata");
    expect(button.disabled).toBe(false);
  });

  it("shows a helpful message when the DJ overview is not loaded", async () => {
    const handlers = {};
    const output = { textContent: "" };
    bindDjChatGptHandoff({
      button: { addEventListener: (name, handler) => { handlers[name] = handler; } },
      getOverview: () => null,
      output,
      openWindow: vi.fn(),
      clipboard: { writeText: vi.fn() },
    });

    await handlers.click();

    expect(output.textContent).toContain("nog niet geladen");
  });
});
