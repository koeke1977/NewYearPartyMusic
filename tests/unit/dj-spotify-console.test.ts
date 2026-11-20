import { describe, expect, it, vi } from "vitest";
import { createDjSpotifyConsole } from "../../apps/web/modules/dj-spotify-console.js";

function fakeElement() {
  const listeners = {};
  const classes = new Set();
  return {
    textContent: "",
    value: "",
    hidden: false,
    disabled: false,
    listeners,
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    addEventListener(name, handler) { listeners[name] = handler; },
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    replaceChildren: vi.fn(),
    append: vi.fn(),
  };
}

function setup() {
  const selectors = [
    "#spotify-connection-state", "#spotify-device", "#spotify-now-playing",
    "#spotify-connect", "#master-volume", "#master-volume-value",
    "#master-volume-leds", "#master-volume-status",
    '[data-spotify-command="play"]', '[data-spotify-command="pause"]',
  ];
  const elements = Object.fromEntries(selectors.map(selector => [selector, fakeElement()]));
  const documentRef = {
    querySelector: selector => elements[selector] || null,
    querySelectorAll: selector => selector === "[data-spotify-command]"
      ? [elements['[data-spotify-command="play"]'], elements['[data-spotify-command="pause"]']]
      : [],
    createElement: () => fakeElement(),
  };
  const playback = {
    beginStatus: vi.fn(() => 7),
    isStatusCurrent: vi.fn(() => true),
    completeStatus: vi.fn(),
    runCommand: vi.fn(async () => ({})),
  };
  const api = vi.fn(async path => path === "/api/dj/spotify/status" ? {
    connected: true,
    playing: true,
    device: { name: "Living Room", type: "Speaker", volume: 65 },
    track: { name: "Music Sounds Better With You", artists: ["Stardust"] },
  } : {});
  const spotify = createDjSpotifyConsole({
    api,
    getPlayback: () => playback,
    documentRef,
    windowRef: { location: {} },
  });
  return { spotify, api, playback, elements, documentRef };
}

describe("DJ Spotify console", () => {
  it("renders current Spotify connection, device, track and playback controls", async () => {
    const { spotify, api, playback, elements } = setup();
    await spotify.refreshStatus();

    expect(api).toHaveBeenCalledWith("/api/dj/spotify/status");
    expect(elements["#spotify-connection-state"].textContent).toBe("CONNECTED");
    expect(elements["#spotify-device"].textContent).toBe("ACTIVE DEVICE · Living Room (Speaker)");
    expect(elements["#spotify-now-playing"].textContent).toContain("Music Sounds Better With You — Stardust");
    expect(elements["#master-volume-value"].textContent).toBe("65%");
    expect(elements['[data-spotify-command="play"]'].classList.contains("is-selected")).toBe(true);
    expect(playback.completeStatus).toHaveBeenCalledWith(7);
  });

  it("ignores a stale Spotify status response", async () => {
    const { api, playback, elements, documentRef } = setup();
    playback.isStatusCurrent.mockReturnValue(false);
    const stale = createDjSpotifyConsole({
      api,
      getPlayback: () => playback,
      documentRef,
      windowRef: { location: {} },
    });
    await stale.refreshStatus();

    expect(elements["#spotify-now-playing"].textContent).toBe("");
    expect(playback.completeStatus).toHaveBeenCalledWith(7);
  });
});
