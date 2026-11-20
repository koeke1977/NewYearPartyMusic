import type { Env } from "../../platform/env";
import type { CatalogSearchResult } from "../../modules/music/application/search-spotify-tracks";
import type { CatalogTrack } from "../../modules/music/domain/catalog-track";
import { getSpotifyCatalogToken } from "./catalog-token";

/**
 * Performs a Spotify catalogue track search with the app-level client-credentials token.
 * HTTP status handling intentionally remains with the calling adapter so each endpoint
 * can preserve its current public response contract.
 */
export async function searchSpotifyTracks(env: Env, query: string, limit: number): Promise<Response> {
  const token = await getSpotifyCatalogToken(env);
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", String(limit));

  return fetch(url, {
    headers: { Authorization: "Bearer " + token },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Normalizes untrusted Spotify wire data into the application-owned catalogue DTO. */
function normalizeCatalogTrack(value: unknown): CatalogTrack {
    const track = asRecord(value);
    const album = asRecord(track?.album);
    const images = Array.isArray(album?.images) ? album.images : [];
    const image = asRecord(images[1]) || asRecord(images[0]);
    const artists = Array.isArray(track?.artists) ? track.artists : null;
    if (
      typeof track?.id !== "string" ||
      typeof track.uri !== "string" ||
      typeof track.name !== "string" ||
      typeof track.duration_ms !== "number" ||
      !Number.isFinite(track.duration_ms) ||
      !artists ||
      !artists.every(artist => typeof asRecord(artist)?.name === "string")
    ) {
      throw new Error("Spotify gaf een onvolledig trackantwoord terug.");
    }
    return {
      id: track.id,
      uri: track.uri,
      name: track.name,
      artists: artists.map(artist => (asRecord(artist) as { name: string }).name),
      albumImageUrl: typeof image?.url === "string" ? image.url : null,
      durationMs: track.duration_ms,
    };
}

function normalizeCatalogTracks(payload: unknown): CatalogTrack[] {
  const root = asRecord(payload);
  const tracks = asRecord(root?.tracks);
  const items = tracks?.items;
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw new Error("Spotify gaf een ongeldig zoekresultaat terug.");
  return items.map(normalizeCatalogTrack);
}

/** Application-facing Spotify catalogue adapter; HTTP and wire DTOs stop here. */
export async function searchSpotifyCatalog(
  env: Env,
  query: string,
  limit: number,
): Promise<CatalogSearchResult> {
  const response = await searchSpotifyTracks(env, query, limit);
  if (response.status === 429) return { kind: "rate-limited" };
  if (!response.ok) return { kind: "unavailable", status: response.status };
  return { kind: "available", tracks: normalizeCatalogTracks(await response.json()) };
}

/**
 * Fetches one Spotify catalogue track. Caller validates the identifier and maps HTTP errors.
 */
export async function getSpotifyTrack(env: Env, trackId: string): Promise<Response> {
  const token = await getSpotifyCatalogToken(env);
  return fetch("https://api.spotify.com/v1/tracks/" + encodeURIComponent(trackId), {
    headers: { Authorization: "Bearer " + token },
  });
}

/** Fetches and normalizes one track; request workflows never see Spotify's wire DTO or Response. */
export async function getSpotifyCatalogTrack(env: Env, trackId: string): Promise<CatalogTrack | null> {
  const response = await getSpotifyTrack(env, trackId);
  if (!response.ok) return null;
  return normalizeCatalogTrack(await response.json());
}
