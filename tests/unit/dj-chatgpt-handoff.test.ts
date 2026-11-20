import { describe, expect, it, vi } from "vitest";
import { bindDjChatGptHandoff, buildDjChatGptPrompt } from "../../apps/web/modules/dj-chatgpt-handoff.js";

describe("DJ ChatGPT handoff prompt", () => {
  it("includes only event timing and DJ-authored preferences", () => {
    const prompt = buildDjChatGptPrompt({
      eventName: "New Year's Eve 2026",
      localTime: "31 dec 2026 21:30",
      djPreferences: ["disco", "90s"],
    });

    expect(prompt).toContain("New Year's Eve 2026");
    expect(prompt).toContain("31 dec 2026 21:30");
    expect(prompt).toContain("DJ-VOORKEUREN: disco, 90s");
    expect(prompt).toContain("geen Spotify-content, requestdata, wachtrij of playbackstatus");
    expect(prompt).not.toContain("queued:");
    expect(prompt).not.toContain("Track A");
    expect(prompt).not.toContain("Artist A");
  });
});

describe("DJ ChatGPT handoff controller", () => {
  it("opens regular ChatGPT and copies only non-Spotify event context", async () => {
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
      getLocalTime: () => "21:30",
      output,
      openWindow,
      clipboard,
    });

    await handlers.click();

    expect(openWindow).toHaveBeenCalledWith("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    const prompt = clipboard.writeText.mock.calls[0][0];
    expect(prompt).toContain("21:30");
    expect(prompt).not.toContain("queued:");
    expect(prompt).not.toContain("Track A");
    expect(output.textContent).toContain("geen Spotify-content of requestdata");
    expect(button.disabled).toBe(false);
  });
});
