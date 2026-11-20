import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../apps/worker/src/platform/env";
import {
  MAX_SPOTIFY_TOOL_QUERIES,
  normalizeSpotifySearchQueries,
  searchSpotifyCatalogForAssistant,
  spotifyCatalogSearchTool,
} from "../../apps/worker/src/integrations/ai/spotify-catalog-search";

vi.mock("../../apps/worker/src/integrations/spotify/catalog-api", () => ({
  searchSpotifyTracks: vi.fn(),
}));

import { searchSpotifyTracks } from "../../apps/worker/src/integrations/spotify/catalog-api";

describe("AI Spotify catalogue search tool", () => {
  it("exposes a read-only search tool contract", () => {
    expect(spotifyCatalogSearchTool.name).toBe("searchSpotifyTracks");
    expect(spotifyCatalogSearchTool.parameters.properties.queries.maxItems).toBe(20);
    expect(spotifyCatalogSearchTool.description).toContain("never add tracks");
  });

  it("parses JSON arguments, trims, bounds and deduplicates queries", () => {
    expect(normalizeSpotifySearchQueries('{"queries":["  Stardust   Music Sounds Better With You  ","x","Stardust Music Sounds Better With You",4]}'))
      .toEqual(["Stardust Music Sounds Better With You"]);
  });

  it("rejects malformed or non-array tool arguments", () => {
    expect(normalizeSpotifySearchQueries("{broken")).toEqual([]);
    expect(normalizeSpotifySearchQueries({ queries: "not-an-array" })).toEqual([]);
    expect(normalizeSpotifySearchQueries({ queries: ["", "ab", null] })).toEqual([]);
  });

  it("caps query count and query length", () => {
    const queries = Array.from({ length: 30 }, (_, index) => "artist track " + index);
    const normalized = normalizeSpotifySearchQueries({ queries });
    expect(normalized).toHaveLength(MAX_SPOTIFY_TOOL_QUERIES);
    expect(normalizeSpotifySearchQueries({ queries: ["x".repeat(300) + "abc"] })[0]).toHaveLength(140);
  });

  it("maps verified Spotify results and isolates individual search failures", async () => {
    vi.mocked(searchSpotifyTracks)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        tracks: { items: [{
          id: "0123456789012345678901",
          uri: "spotify:track:0123456789012345678901",
          name: "Music Sounds Better With You",
          duration_ms: 240000,
          artists: [{ name: "Stardust" }],
          album: { images: [{ url: "https://img.example/large.jpg" }, { url: "https://img.example/small.jpg" }] },
        }] },
      }), { status: 200 }))
      .mockRejectedValueOnce(new Error("temporary Spotify failure"));

    const results = await searchSpotifyCatalogForAssistant(
      { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" } as Env,
      { queries: ["Stardust Music Sounds Better With You", "Second Artist Track"] },
    );

    expect(results).toEqual([
      {
        query: "Stardust Music Sounds Better With You",
        tracks: [{
          id: "0123456789012345678901",
          uri: "spotify:track:0123456789012345678901",
          name: "Music Sounds Better With You",
          artists: ["Stardust"],
          durationMs: 240000,
          albumImageUrl: "https://img.example/small.jpg",
        }],
      },
      { query: "Second Artist Track", tracks: [] },
    ]);
    expect(searchSpotifyTracks).toHaveBeenCalledTimes(2);
    expect(searchSpotifyTracks).toHaveBeenCalledWith(expect.anything(), "Stardust Music Sounds Better With You", 3);
  });

  it("returns an empty match list without making requests for invalid arguments", async () => {
    vi.mocked(searchSpotifyTracks).mockClear();
    await expect(searchSpotifyCatalogForAssistant({} as Env, { queries: [] })).resolves.toEqual([]);
    expect(searchSpotifyTracks).not.toHaveBeenCalled();
  });
});
