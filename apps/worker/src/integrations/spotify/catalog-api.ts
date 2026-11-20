import type { Env } from "../../platform/env";
import { getSpotifyCatalogToken } from "./catalog-token";

/**
 * Performs a Spotify catalogue track search with the app-level client-credentials token.
 * HTTP status handling intentionally remains with the calling use case so each existing
 * endpoint can preserve its current public response contract.
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

/**
 * Fetches one Spotify catalogue track. Caller validates the identifier and maps HTTP errors.
 */
export async function getSpotifyTrack(env: Env, trackId: string): Promise<Response> {
  const token = await getSpotifyCatalogToken(env);
  return fetch("https://api.spotify.com/v1/tracks/" + encodeURIComponent(trackId), {
    headers: { Authorization: "Bearer " + token },
  });
}
