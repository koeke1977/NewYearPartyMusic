import { describe, expect, it, vi } from "vitest";
import { getDjSpotifyPlaybackStatus } from "../../apps/worker/src/modules/playback/application/get-dj-spotify-playback-status";

const track = {
  id: "track-1", uri: "spotify:track:track-1", name: "Song",
  artists: [{ name: "Artist" }], album: { images: [{ url: "https://img.example/cover.jpg" }] },
  duration_ms: 180000,
};

function dependencies(overrides: Partial<Parameters<typeof getDjSpotifyPlaybackStatus>[0]> = {}) {
  return {
    getCurrentPlayback: vi.fn(async () => Response.json({ is_playing: true, progress_ms: 1200, item: track })),
    getPlaybackQueue: vi.fn(async () => Response.json({ queue: [] })),
    maybeAdvance: vi.fn(async () => ({ advanced: false })),
    maybeStartFallback: vi.fn(async () => false),
    readFallbackError: vi.fn(async () => null),
    clearManualPause: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("DJ Spotify playback status use case", () => {
  it("returns the disconnected-device shape and runs fallback/advance checks on HTTP 204", async () => {
    const deps = dependencies({
      getCurrentPlayback: vi.fn(async () => new Response(null, { status: 204 })),
      maybeStartFallback: vi.fn(async () => true),
      maybeAdvance: vi.fn(async () => ({ advanced: true })),
      readFallbackError: vi.fn(async () => "Previous error"),
    });
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

  it("maps current playback, clears stale manual pause and exposes next fallback track", async () => {
    const upcoming = { ...track, id: "next", uri: "spotify:track:next", name: "Next song" };
    const deps = dependencies({
      getCurrentPlayback: vi.fn(async () => Response.json({
        is_playing: true, progress_ms: 4200, item: track,
        device: { id: "device-1", name: "Living room", type: "Speaker", is_active: true, volume_percent: 42 },
      })),
      getPlaybackQueue: vi.fn(async () => Response.json({ queue: [upcoming] })),
      maybeStartFallback: vi.fn(async () => true),
      maybeAdvance: vi.fn(async () => ({ advanced: false, error: "No queued request" })),
    });
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

  it("does not query the playback queue when fallback is inactive", async () => {
    const deps = dependencies();
    const result = await getDjSpotifyPlaybackStatus(deps);
    expect(result.status).toBe(200);
    expect(deps.getPlaybackQueue).not.toHaveBeenCalled();
    expect(deps.clearManualPause).toHaveBeenCalledOnce();
  });

  it("maps Spotify non-success responses and unexpected failures", async () => {
    const rejected = await getDjSpotifyPlaybackStatus(dependencies({
      getCurrentPlayback: vi.fn(async () => new Response(null, { status: 503 })),
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
