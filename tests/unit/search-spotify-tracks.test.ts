import { describe, expect, it, vi } from "vitest";
import { searchDjSpotifyTracks, searchGuestSpotifyTracks } from "../../apps/worker/src/modules/music/application/search-spotify-tracks";

const spotifyTrack = {
  id: "track-1", uri: "spotify:track:track-1", name: "Song", duration_ms: 180000,
  artists: [{ name: "Artist" }], album: { images: [{ url: "https://img.example/cover.jpg" }] },
};

describe("Spotify catalogue search use cases", () => {
  it("validates guest query bounds and returns mapped Spotify tracks", async () => {
    const search = vi.fn(async () => Response.json({ tracks: { items: [spotifyTrack] } }));
    expect(await searchGuestSpotifyTracks({ query: "a", search })).toMatchObject({ status: 400 });
    expect(await searchGuestSpotifyTracks({ query: "a".repeat(101), search })).toMatchObject({ status: 400 });
    expect(search).not.toHaveBeenCalled();

    await expect(searchGuestSpotifyTracks({ query: "  song  ", search })).resolves.toEqual({
      status: 200,
      body: {
        tracks: [{
          id: "track-1", uri: "spotify:track:track-1", name: "Song", artists: ["Artist"],
          albumImageUrl: "https://img.example/cover.jpg", durationMs: 180000,
        }],
        attribution: "Music data provided by Spotify",
      },
    });
    expect(search).toHaveBeenCalledWith("song", 8);
  });

  it("maps guest Spotify rate limits, API errors and network failures", async () => {
    await expect(searchGuestSpotifyTracks({
      query: "song", search: async () => new Response(null, { status: 429 }),
    })).resolves.toMatchObject({ status: 429 });
    await expect(searchGuestSpotifyTracks({
      query: "song", search: async () => new Response(null, { status: 503 }),
    })).resolves.toMatchObject({ status: 502 });
    await expect(searchGuestSpotifyTracks({
      query: "song", search: async () => { throw new Error("network down"); },
    })).resolves.toEqual({ status: 503, body: { error: "network down" } });
  });

  it("normalizes and bounds DJ queries and maps successful results", async () => {
    const search = vi.fn(async (query: string) => {
      if (query === "bad query") return new Response(null, { status: 429 });
      return Response.json({ tracks: { items: [spotifyTrack] } });
    });
    const result = await searchDjSpotifyTracks({
      queries: ["  90s   dance  ", "bad query", "x", "a".repeat(200)],
      search,
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      ok: true,
      results: [
        {
          query: "90s dance",
          tracks: [{
            id: "track-1", uri: "spotify:track:track-1", name: "Song", artists: ["Artist"],
            durationMs: 180000, albumImageUrl: "https://img.example/cover.jpg",
          }],
        },
        { query: "bad query", tracks: [] },
        {
          query: "a".repeat(140),
          tracks: [{
            id: "track-1", uri: "spotify:track:track-1", name: "Song", artists: ["Artist"],
            durationMs: 180000, albumImageUrl: "https://img.example/cover.jpg",
          }],
        },
      ],
    });
    expect(search).toHaveBeenCalledTimes(3);
    expect(search).toHaveBeenNthCalledWith(1, "90s dance", 3);
    expect(search).toHaveBeenNthCalledWith(2, "bad query", 3);
    expect(search).toHaveBeenNthCalledWith(3, "a".repeat(140), 3);
  });

  it("rejects malformed or excessive DJ query arrays and handles empty normalized input", async () => {
    const search = vi.fn();
    expect(await searchDjSpotifyTracks({ queries: "song", search })).toMatchObject({ status: 400 });
    expect(await searchDjSpotifyTracks({ queries: new Array(21).fill("song"), search })).toMatchObject({ status: 400 });
    expect(await searchDjSpotifyTracks({ queries: ["  ", "ab"], search })).toMatchObject({ status: 400 });
    expect(search).not.toHaveBeenCalled();
  });

  it("returns an empty result for a Spotify non-success response for an individual DJ query", async () => {
    await expect(searchDjSpotifyTracks({
      queries: ["song"],
      search: async () => new Response(null, { status: 429 }),
    })).resolves.toEqual({ status: 200, body: { ok: true, results: [{ query: "song", tracks: [] }] } });
  });

  it("preserves the existing request-level error when a DJ Spotify query rejects", async () => {
    await expect(searchDjSpotifyTracks({
      queries: ["song"],
      search: async () => { throw new Error("Spotify offline"); },
    })).resolves.toEqual({ status: 502, body: { error: "Spotify offline" } });
  });
});
