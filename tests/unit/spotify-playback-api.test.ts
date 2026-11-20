import { describe, expect, it, vi } from "vitest";
import {
  getCurrentPlayback,
  getPlaybackDevices,
  getPlaybackQueue,
  playPlaylist,
  playTrack,
  sendPlaybackCommand,
  setPlaybackShuffle,
  setPlaybackVolume,
} from "../../apps/worker/src/integrations/spotify/playback-api";

describe("Spotify playback API adapter", () => {
  it("reads playback state, queue and devices through the injected authenticated client", async () => {
    const client = vi.fn(async () => new Response(null, { status: 204 }));
    await getCurrentPlayback(client);
    await getPlaybackQueue(client);
    await getPlaybackDevices(client);
    expect(client.mock.calls.map(([path]) => path)).toEqual([
      "/me/player", "/me/player/queue", "/me/player/devices",
    ]);
    expect(client.mock.calls.every(([, init]) => init === undefined)).toBe(true);
  });

  it("builds a track play request with the expected Spotify URI payload", async () => {
    const client = vi.fn(async () => new Response(null, { status: 204 }));
    await playTrack(client, "spotify:track:abc");
    expect(client).toHaveBeenCalledWith("/me/player/play", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: ["spotify:track:abc"] }),
    });
  });

  it("builds a playlist play request and shuffle request", async () => {
    const client = vi.fn(async () => new Response(null, { status: 204 }));
    await playPlaylist(client, "spotify:playlist:abc");
    await setPlaybackShuffle(client, true);
    expect(client.mock.calls[0]).toEqual(["/me/player/play", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_uri: "spotify:playlist:abc" }),
    }]);
    expect(client.mock.calls[1]).toEqual(["/me/player/shuffle?state=true", { method: "PUT" }]);
  });

  it("builds volume and transport requests without handling tokens", async () => {
    const client = vi.fn(async () => new Response(null, { status: 204 }));
    await setPlaybackVolume(client, 42);
    await sendPlaybackCommand(client, "play");
    await sendPlaybackCommand(client, "pause");
    await sendPlaybackCommand(client, "next");
    await sendPlaybackCommand(client, "previous");
    expect(client.mock.calls).toEqual([
      ["/me/player/volume?volume_percent=42", { method: "PUT" }],
      ["/me/player/play", { method: "PUT" }],
      ["/me/player/pause", { method: "PUT" }],
      ["/me/player/next", { method: "POST" }],
      ["/me/player/previous", { method: "POST" }],
    ]);
  });

  it("returns the original Spotify response unchanged, including error status", async () => {
    const spotifyResponse = new Response("rate limited", { status: 429 });
    const client = vi.fn(async () => spotifyResponse);
    const response = await getCurrentPlayback(client);
    expect(response).toBe(spotifyResponse);
    expect(response.status).toBe(429);
    expect(await response.text()).toBe("rate limited");
  });
});
