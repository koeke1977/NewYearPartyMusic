import { describe, expect, it } from "vitest";
import {
  normalizeSpotifyVolume,
  getSpotifyPlaybackControls,
  getSpotifyPlaybackSummary,
} from "../../apps/web/modules/dj-playback-state.js";

describe("Spotify playback state", () => {
  it("normalizes volume to a finite percentage between zero and one hundred", () => {
    expect(normalizeSpotifyVolume(42)).toBe(42);
    expect(normalizeSpotifyVolume(140)).toBe(100);
    expect(normalizeSpotifyVolume(-10)).toBe(0);
    expect(normalizeSpotifyVolume("65")).toBe(65);
    expect(normalizeSpotifyVolume("invalid")).toBe(0);
    expect(normalizeSpotifyVolume(Infinity)).toBe(0);
  });

  it("derives control and booth state from connection and playback state", () => {
    expect(getSpotifyPlaybackControls(false, true)).toEqual({
      playSelected: false,
      pauseSelected: false,
      playEnabled: false,
      pauseEnabled: false,
      boothPlaying: false,
      boothStatus: "OFFLINE",
    });
    expect(getSpotifyPlaybackControls(true, true)).toMatchObject({
      playSelected: true,
      pauseSelected: false,
      boothPlaying: true,
      boothStatus: "ON AIR",
    });
    expect(getSpotifyPlaybackControls(true, false)).toMatchObject({
      playSelected: false,
      pauseSelected: true,
      boothPlaying: false,
      boothStatus: "PAUSED",
    });
  });

  it("maps a connected device and current track into display-ready state", () => {
    expect(getSpotifyPlaybackSummary({
      connected: true,
      playing: true,
      track: { name: "Track", artists: ["Artist"] },
      device: { name: "Living Room", type: "Speaker", volume: 55 },
    })).toEqual({
      connection: "CONNECTED",
      nowPlaying: "▶ NOW PLAYING · Track — Artist",
      device: "ACTIVE DEVICE · Living Room (Speaker)",
      hasActiveDevice: true,
      volume: 55,
    });
  });

  it("prioritizes auto-advance and fallback errors over track text", () => {
    const base = { connected: true, playing: true, track: { name: "Track", artists: ["Artist"] } };
    expect(getSpotifyPlaybackSummary({ ...base, autoAdvanceError: "No device" }).nowPlaying)
      .toBe("AUTO NEXT ERROR · No device");
    expect(getSpotifyPlaybackSummary({ ...base, fallbackError: "Unavailable" }).nowPlaying)
      .toBe("FALLBACK ERROR · Unavailable");
  });

  it("handles an absent device and absent track", () => {
    expect(getSpotifyPlaybackSummary({ connected: false }).nowPlaying)
      .toBe("No track is currently playing.");
    expect(getSpotifyPlaybackSummary({ connected: true })).toMatchObject({
      device: "Spotify is connected. Open Spotify on a device to make it active.",
      hasActiveDevice: false,
      volume: null,
    });
  });
});
