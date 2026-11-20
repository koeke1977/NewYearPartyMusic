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

  it("normalizes Spotify wire tracks into the application catalogue DTO", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "catalogue-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        tracks: { items: [{
          id: "track-1", uri: "spotify:track:track-1", name: "Song", duration_ms: 180000,
          artists: [{ name: "Artist" }],
          album: { images: [{ url: "https://img.example/small.jpg" }, { url: "https://img.example/large.jpg" }] },
        }] },
      }), { status: 200 }));
    const { searchSpotifyCatalog } = await import("../../apps/worker/src/integrations/spotify/catalog-api");

    await expect(searchSpotifyCatalog(env, "song", 8)).resolves.toEqual({
      kind: "available",
      tracks: [{
        id: "track-1", uri: "spotify:track:track-1", name: "Song",
        artists: ["Artist"], albumImageUrl: "https://img.example/large.jpg", durationMs: 180000,
      }],
    });
  });

  it("maps Spotify rate limits and provider errors to typed catalogue results", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "catalogue-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    const { searchSpotifyCatalog } = await import("../../apps/worker/src/integrations/spotify/catalog-api");
    await expect(searchSpotifyCatalog(env, "song", 8)).resolves.toEqual({ kind: "rate-limited" });
  });

  it("returns typed unavailable results for other Spotify HTTP errors", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "catalogue-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const { searchSpotifyCatalog } = await import("../../apps/worker/src/integrations/spotify/catalog-api");
    await expect(searchSpotifyCatalog(env, "song", 8)).resolves.toEqual({ kind: "unavailable", status: 503 });
  });

  it("rejects malformed Spotify track payloads at the integration boundary", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "catalogue-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tracks: { items: [{ id: "broken" }] } }), { status: 200 }));
    const { searchSpotifyCatalog } = await import("../../apps/worker/src/integrations/spotify/catalog-api");
    await expect(searchSpotifyCatalog(env, "song", 8)).rejects.toThrow("Spotify gaf een onvolledig trackantwoord terug.");
  });


  it("normalizes an individual Spotify track into the shared catalogue DTO", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "catalogue-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(Response.json({
        id: "track-1", uri: "spotify:track:track-1", name: "Song", duration_ms: 180000,
        artists: [{ name: "Artist" }],
        album: { images: [{ url: "https://img.example/small.jpg" }, { url: "https://img.example/large.jpg" }] },
      }));
    const { getSpotifyCatalogTrack } = await import("../../apps/worker/src/integrations/spotify/catalog-api");
    await expect(getSpotifyCatalogTrack(env, "track-1")).resolves.toEqual({
      id: "track-1", uri: "spotify:track:track-1", name: "Song",
      artists: ["Artist"], albumImageUrl: "https://img.example/large.jpg", durationMs: 180000,
    });
  });

  it("returns null when the selected Spotify track is no longer available", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "catalogue-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const { getSpotifyCatalogTrack } = await import("../../apps/worker/src/integrations/spotify/catalog-api");
    await expect(getSpotifyCatalogTrack(env, "missing-track")).resolves.toBeNull();
  });

  it("fails closed when an individual Spotify track payload is malformed", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "catalogue-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(Response.json({ id: "broken" }));
    const { getSpotifyCatalogTrack } = await import("../../apps/worker/src/integrations/spotify/catalog-api");
    await expect(getSpotifyCatalogTrack(env, "broken")).rejects.toThrow("Spotify gaf een onvolledig trackantwoord terug.");
  });

});
