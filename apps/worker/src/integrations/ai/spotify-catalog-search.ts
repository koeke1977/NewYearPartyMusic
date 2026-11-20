import type { Env } from "../../platform/env";
import { searchSpotifyTracks } from "../spotify/catalog-api";
import type { SpotifyTrack } from "../spotify/types";

export type SpotifyCatalogMatch = {
  query: string;
  tracks: Array<{
    id: string;
    uri: string;
    name: string;
    artists: string[];
    durationMs: number;
    albumImageUrl: string | null;
  }>;
};

export const spotifyCatalogSearchTool = {
  name: "searchSpotifyTracks",
  description: "Search Spotify for real track versions when the DJ asks for a specific song, track suggestions, or a starter/fill list. Only read/search: never add tracks, reorder the queue, or control playback. Do not use this tool for pure DJ advice or reordering the existing queue.",
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        description: "Exact Spotify search queries, preferably title plus artist.",
        items: { type: "string" },
        minItems: 1,
        maxItems: 20,
      },
    },
    required: ["queries"],
  },
} as const;

export const MAX_SPOTIFY_TOOL_QUERIES = 20;
export const MAX_SPOTIFY_QUERY_LENGTH = 140;
const TRACKS_PER_QUERY = 3;

function parseArguments(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Validate and bound untrusted model arguments before any Spotify request is made. */
export function normalizeSpotifySearchQueries(value: unknown): string[] {
  const args = parseArguments(value);
  if (!args || !Array.isArray(args.queries)) return [];

  const queries = args.queries
    .filter((query): query is string => typeof query === "string")
    .map((query) => query.replace(/\s+/g, " ").trim().slice(0, MAX_SPOTIFY_QUERY_LENGTH))
    .filter((query) => query.length > 2);

  return [...new Set(queries)].slice(0, MAX_SPOTIFY_TOOL_QUERIES);
}

function mapTrack(track: SpotifyTrack) {
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: track.artists.map((artist) => artist.name),
    durationMs: track.duration_ms,
    albumImageUrl: track.album.images?.[1]?.url || track.album.images?.[0]?.url || null,
  };
}

/**
 * Executes only bounded, read-only catalogue searches. It has no access to D1,
 * Spotify user OAuth tokens, queue mutation or playback operations.
 */
export async function searchSpotifyCatalogForAssistant(
  env: Env,
  toolArguments: unknown,
): Promise<SpotifyCatalogMatch[]> {
  const queries = normalizeSpotifySearchQueries(toolArguments);
  return Promise.all(queries.map(async (query) => {
    try {
      const response = await searchSpotifyTracks(env, query, TRACKS_PER_QUERY);
      if (!response.ok) return { query, tracks: [] };
      const data = await response.json() as { tracks?: { items?: SpotifyTrack[] } };
      return { query, tracks: (data.tracks?.items || []).map(mapTrack) };
    } catch {
      // One failed search must not discard the other verified catalogue results.
      return { query, tracks: [] };
    }
  }));
}
