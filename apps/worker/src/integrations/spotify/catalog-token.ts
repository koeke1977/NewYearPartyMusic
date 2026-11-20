import type { Env } from "../../platform/env";

type CachedCatalogToken = {
  value: string;
  expiresAt: number;
};

// This cache is isolate-local and contains only Spotify's app-level catalogue token.
// User OAuth tokens are handled by a separate integration and must never share this cache.
let cachedToken: CachedCatalogToken | null = null;

export async function getSpotifyCatalogToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
    throw new Error("Spotify API is nog niet geconfigureerd.");
  }

  const credentials = btoa(env.SPOTIFY_CLIENT_ID + ":" + env.SPOTIFY_CLIENT_SECRET);
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + credentials,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error("Spotify kon geen API-token leveren (HTTP " + response.status + ").");
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}
