import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../apps/worker/src/platform/env";

describe("Spotify catalogue API adapter", () => {
  const env = {
    SPOTIFY_CLIENT_ID: "test-client-id",
    SPOTIFY_CLIENT_SECRET: "test-client-secret",
  } as Env;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds a track search request and applies the app token", async () => {
    const fetchMock = vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "catalogue-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tracks: { items: [] } }), { status: 200 }));
    const { searchSpotifyTracks } = await import("../../apps/worker/src/integrations/spotify/catalog-api");

    const response = await searchSpotifyTracks(env, "Stardust Music Sounds Better With You", 8);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toContain("https://api.spotify.com/v1/search?");
    expect(String(url)).toContain("q=Stardust+Music+Sounds+Better+With+You");
    expect(String(url)).toContain("type=track");
    expect(String(url)).toContain("limit=8");
    expect(init?.headers).toEqual({ Authorization: "Bearer catalogue-token" });
  });

  it("fetches an individual track through the catalogue adapter", async () => {
    const fetchMock = vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "catalogue-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "0123456789012345678901" }), { status: 200 }));
    const { getSpotifyTrack } = await import("../../apps/worker/src/integrations/spotify/catalog-api");

    const response = await getSpotifyTrack(env, "0123456789012345678901");

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.spotify.com/v1/tracks/0123456789012345678901");
    expect(fetchMock.mock.calls[1][1]?.headers).toEqual({ Authorization: "Bearer catalogue-token" });
  });
});
