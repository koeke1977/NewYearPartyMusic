import { describe, expect, it, vi } from "vitest";
import { getDjSpotifyPlaybackStatus } from "../../apps/worker/src/modules/playback/application/get-dj-spotify-playback-status";
import type { SpotifyPlaybackGateway, SpotifyPlaybackTrack } from "../../apps/worker/src/modules/playback/application/playback-ports";

const track: SpotifyPlaybackTrack = {
  id: "track-1", uri: "spotify:track:track-1", name: "Song",
  artists: ["Artist"], image: "https://img.example/cover.jpg", durationMs: 180000,
};

function dependencies(gatewayOverrides: Partial<SpotifyPlaybackGateway> = {}) {
  const gateway: SpotifyPlaybackGateway = {
    getCurrentPlayback: vi.fn(async () => ({
      kind: "available" as const, playing: true, progressMs: 1200, track, device: null,
    })),
    getPlaybackQueue: vi.fn(async () => ({ kind: "available" as const, tracks: [] })),
    ...gatewayOverrides,
  };
  return {
    gateway,
    maybeAdvance: vi.fn(async () => ({ advanced: false })),
    maybeStartFallback: vi.fn(async () => false),
    readFallbackError: vi.fn(async () => null),
    clearManualPause: vi.fn(async () => {}),
  };
}

describe("DJ Spotify playback status use case", () => {
  it("handles no active device and runs fallback/advance checks", async () => {
    const deps = dependencies({
      getCurrentPlayback: vi.fn(async () => ({ kind: "no-active-device" as const })),
    });
    deps.maybeStartFallback.mockResolvedValue(true);
    deps.maybeAdvance.mockResolvedValue({ advanced: true });
    deps.readFallbackError.mockResolvedValue("Previous error");
    const result = await getDjSpotifyPlaybackStatus(deps);
    expect(result).toEqual({
      status: 200,
      body: {
        connected: true, playing: false, device: null, track: null, nextTrack: null,
        fallbackActive: true, autoAdvanced: true, autoAdvanceError: null, fallbackError: "Previous error",
      },
    });
    expect(deps.maybeStartFallback).toHaveBeenCalledWith(null, false, 0, 0);
    expect(deps.maybeAdvance).toHaveBeenCalledWith(false);
  });

  it("maps current playback, clears manual pause and exposes next fallback track", async () => {
    const upcoming = { ...track, id: "next", uri: "spotify:track:next", name: "Next song" };
    const deps = dependencies({
      getCurrentPlayback: vi.fn(async () => ({
        kind: "available" as const, playing: true, progressMs: 4200, track,
        device: { id: "device-1", name: "Living room", type: "Speaker", active: true, volume: 42 },
      })),
      getPlaybackQueue: vi.fn(async () => ({ kind: "available" as const, tracks: [upcoming] })),
    });
    deps.maybeStartFallback.mockResolvedValue(true);
    deps.maybeAdvance.mockResolvedValue({ advanced: false, error: "No queued request" });
    const result = await getDjSpotifyPlaybackStatus(deps);
    expect(deps.clearManualPause).toHaveBeenCalledOnce();
    expect(deps.maybeStartFallback).toHaveBeenCalledWith(track.uri, true, 4200, 180000);
    expect(result).toMatchObject({
      status: 200,
      body: {
        connected: true, playing: true, progressMs: 4200, fallbackActive: true,
        autoAdvanced: false, autoAdvanceError: "No queued request",
        device: { id: "device-1", name: "Living room", type: "Speaker", active: true, volume: 42 },
        track: { id: "track-1", name: "Song", artists: ["Artist"], image: "https://img.example/cover.jpg", durationMs: 180000 },
        nextTrack: { id: "next", name: "Next song" },
      },
    });
  });

  it("does not query the queue or clear pause while fallback is inactive", async () => {
    const deps = dependencies();
    const result = await getDjSpotifyPlaybackStatus(deps);
    expect(result.status).toBe(200);
    expect(deps.gateway.getPlaybackQueue).not.toHaveBeenCalled();
    expect(deps.clearManualPause).toHaveBeenCalledOnce();
  });

  it("maps Spotify unavailable results and unexpected failures", async () => {
    const rejected = await getDjSpotifyPlaybackStatus(dependencies({
      getCurrentPlayback: vi.fn(async () => ({ kind: "unavailable" as const, status: 503 })),
    }));
    expect(rejected).toEqual({
      status: 502,
      body: { error: "Spotify playbackstatus niet beschikbaar (HTTP 503)." },
    });

    const failed = await getDjSpotifyPlaybackStatus(dependencies({
      getCurrentPlayback: vi.fn(async () => { throw new Error("network down"); }),
    }));
    expect(failed).toEqual({ status: 503, body: { connected: false, error: "network down" } });
  });
});
