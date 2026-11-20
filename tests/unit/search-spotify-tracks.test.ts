import { describe, expect, it, vi } from "vitest";
import {
  searchDjSpotifyTracks,
  searchGuestSpotifyTracks,
  type CatalogSearchResult,
} from "../../apps/worker/src/modules/music/application/search-spotify-tracks";

const catalogTrack = {
  id: "track-1",
  uri: "spotify:track:track-1",
  name: "Song",
  artists: ["Artist"],
  albumImageUrl: "https://img.example/cover.jpg",
  durationMs: 180000,
};
const available = (tracks = [catalogTrack]): CatalogSearchResult => ({ kind: "available", tracks });

describe("Spotify catalogue search use cases", () => {
  it("validates guest query bounds and returns application tracks in the guest API shape", async () => {
    const gateway = { search: vi.fn(async () => available()) };
    expect(await searchGuestSpotifyTracks({ query: "a", gateway })).toMatchObject({ status: 400 });
    expect(await searchGuestSpotifyTracks({ query: "a".repeat(101), gateway })).toMatchObject({ status: 400 });
    expect(gateway.search).not.toHaveBeenCalled();

    await expect(searchGuestSpotifyTracks({ query: "  song  ", gateway })).resolves.toEqual({
      status: 200,
      body: {
        tracks: [{
          id: "track-1", uri: "spotify:track:track-1", name: "Song", artists: ["Artist"],
          albumImageUrl: "https://img.example/cover.jpg", durationMs: 180000,
        }],
        attribution: "Music data provided by Spotify",
      },
    });
    expect(gateway.search).toHaveBeenCalledWith("song", 8);
  });

  it("maps guest Spotify rate limits, API errors and network failures", async () => {
    await expect(searchGuestSpotifyTracks({
      query: "song", gateway: { search: async () => ({ kind: "rate-limited" }) },
    })).resolves.toMatchObject({ status: 429 });
    await expect(searchGuestSpotifyTracks({
      query: "song", gateway: { search: async () => ({ kind: "unavailable", status: 503 }) },
    })).resolves.toMatchObject({ status: 502 });
    await expect(searchGuestSpotifyTracks({
      query: "song", gateway: { search: async () => { throw new Error("network down"); } },
    })).resolves.toEqual({ status: 503, body: { error: "network down" } });
  });

  it("normalizes and bounds DJ queries and maps successful results", async () => {
    const search = vi.fn(async (query: string): Promise<CatalogSearchResult> =>
      query === "bad query" ? { kind: "rate-limited" } : available());
    const result = await searchDjSpotifyTracks({
      queries: ["  90s   dance  ", "bad query", "x", "a".repeat(200)],
      gateway: { search },
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      ok: true,
      results: [
        { query: "90s dance", tracks: [catalogTrack] },
        { query: "bad query", tracks: [] },
        { query: "a".repeat(140), tracks: [catalogTrack] },
      ],
    });
    expect(search).toHaveBeenCalledTimes(3);
    expect(search).toHaveBeenNthCalledWith(1, "90s dance", 3);
    expect(search).toHaveBeenNthCalledWith(2, "bad query", 3);
    expect(search).toHaveBeenNthCalledWith(3, "a".repeat(140), 3);
  });

  it("rejects malformed or excessive DJ query arrays and handles empty normalized input", async () => {
    const search = vi.fn();
    const gateway = { search };
    expect(await searchDjSpotifyTracks({ queries: "song", gateway })).toMatchObject({ status: 400 });
    expect(await searchDjSpotifyTracks({ queries: new Array(21).fill("song"), gateway })).toMatchObject({ status: 400 });
    expect(await searchDjSpotifyTracks({ queries: ["  ", "ab"], gateway })).toMatchObject({ status: 400 });
    expect(search).not.toHaveBeenCalled();
  });

  it("returns an empty result for a Spotify non-success response for an individual DJ query", async () => {
    await expect(searchDjSpotifyTracks({
      queries: ["song"],
      gateway: { search: async () => ({ kind: "unavailable", status: 429 }) },
    })).resolves.toEqual({ status: 200, body: { ok: true, results: [{ query: "song", tracks: [] }] } });
  });

  it("preserves the existing request-level error when a DJ Spotify query rejects", async () => {
    await expect(searchDjSpotifyTracks({
      queries: ["song"],
      gateway: { search: async () => { throw new Error("Spotify offline"); } },
    })).resolves.toEqual({ status: 502, body: { error: "Spotify offline" } });
  });
});
