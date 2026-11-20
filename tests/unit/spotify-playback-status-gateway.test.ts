import { describe, expect, it, vi } from "vitest";
import { createSpotifyPlaybackGateway } from "../../apps/worker/src/integrations/spotify/playback-status-gateway";

describe("Spotify playback status gateway", () => {
  it("maps HTTP 204 to a no-active-device result", async () => {
    const client = vi.fn(async () => new Response(null, { status: 204 }));
    const gateway = createSpotifyPlaybackGateway(client);
    await expect(gateway.getCurrentPlayback()).resolves.toEqual({ kind: "no-active-device" });
  });

  it("maps Spotify wire data into application-owned track and device DTOs", async () => {
    const client = vi.fn(async () => Response.json({
      is_playing: true,
      progress_ms: 1234,
      item: {
        id: "abc", uri: "spotify:track:abc", name: "Song",
        artists: [{ name: "Artist" }], album: { images: [{ url: "https://img.example/a.jpg" }] },
        duration_ms: 210000,
      },
      device: { id: "device", name: "Living room", type: "Speaker", is_active: true, volume_percent: 55 },
    }));
    const gateway = createSpotifyPlaybackGateway(client);
    await expect(gateway.getCurrentPlayback()).resolves.toEqual({
      kind: "available", playing: true, progressMs: 1234,
      track: {
        id: "abc", uri: "spotify:track:abc", name: "Song",
        artists: ["Artist"], image: "https://img.example/a.jpg", durationMs: 210000,
      },
      device: { id: "device", name: "Living room", type: "Speaker", active: true, volume: 55 },
    });
  });

  it("keeps unsuccessful HTTP status codes typed instead of leaking Response", async () => {
    const client = vi.fn(async () => new Response(null, { status: 429 }));
    const gateway = createSpotifyPlaybackGateway(client);
    await expect(gateway.getCurrentPlayback()).resolves.toEqual({ kind: "unavailable", status: 429 });
    await expect(gateway.getPlaybackQueue()).resolves.toEqual({ kind: "unavailable", status: 429 });
  });
});
