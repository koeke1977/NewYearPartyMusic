import type { Env } from "../../platform/env";
import { decryptSecret, encryptSecret } from "../../platform/security/crypto";
import {
  claimSpotifyRefreshLock,
  invalidateSpotifyAccessToken,
  readEncryptedSpotifyTokens,
  releaseSpotifyRefreshLock,
  saveEncryptedSpotifyTokens,
} from "./user-auth-repository";

type SpotifyTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

type SpotifyFetch = typeof fetch;

export async function saveSpotifyTokens(
  env: Env,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): Promise<void> {
  const [accessEncrypted, refreshEncrypted] = await Promise.all([
    encryptSecret(accessToken, env.SESSION_SECRET),
    encryptSecret(refreshToken, env.SESSION_SECRET),
  ]);
  await saveEncryptedSpotifyTokens(env.DB, accessEncrypted, refreshEncrypted, Date.now() + expiresIn * 1000);
}

/**
 * Returns a valid DJ-user access token. Refresh rotation is serialized with
 * the existing D1 lease; encrypted storage and the 60-second expiry margin
 * are intentionally unchanged.
 */
export async function spotifyUserToken(
  env: Env,
  fetcher: SpotifyFetch = fetch,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<string> {
  const owner = crypto.randomUUID();
  for (let attempt = 0; attempt < 16; attempt++) {
    const row = await readEncryptedSpotifyTokens(env.DB);
    if (!row) throw new Error("Koppel eerst je Spotify-account via de DJ-console.");
    if (row.expires_at > Date.now() + 60000) return decryptSecret(row.access_token_enc, env.SESSION_SECRET);
    if (!await claimSpotifyRefreshLock(env.DB, owner)) {
      await wait(200);
      continue;
    }
    try {
      const latest = await readEncryptedSpotifyTokens(env.DB);
      if (!latest) throw new Error("Spotify-koppeling ontbreekt.");
      if (latest.expires_at > Date.now() + 60000) return await decryptSecret(latest.access_token_enc, env.SESSION_SECRET);
      const refreshToken = await decryptSecret(latest.refresh_token_enc, env.SESSION_SECRET);
      const response = await fetcher("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(env.SPOTIFY_CLIENT_ID + ":" + env.SPOTIFY_CLIENT_SECRET),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error("Spotify-token vernieuwen mislukt (HTTP " + response.status + "). " + detail);
      }
      const data = await response.json() as SpotifyTokenResponse;
      await saveSpotifyTokens(env, data.access_token, data.refresh_token || refreshToken, data.expires_in);
      return data.access_token;
    } finally {
      await releaseSpotifyRefreshLock(env.DB, owner);
    }
  }
  throw new Error("Spotify-token wordt momenteel door een andere aanvraag vernieuwd. Probeer zo opnieuw.");
}

/** Authenticated Spotify user API client, including the existing single 401 refresh retry. */
export async function spotifyFetch(
  env: Env,
  path: string,
  init: RequestInit = {},
  fetcher: SpotifyFetch = fetch,
): Promise<Response> {
  let token = await spotifyUserToken(env, fetcher);
  let response = await fetcher("https://api.spotify.com/v1" + path, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: "Bearer " + token },
  });
  if (response.status === 401) {
    await invalidateSpotifyAccessToken(env.DB);
    token = await spotifyUserToken(env, fetcher);
    response = await fetcher("https://api.spotify.com/v1" + path, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: "Bearer " + token },
    });
  }
  return response;
}

/** Exchanges an OAuth authorization code and stores only encrypted credentials. */
export async function exchangeSpotifyAuthorizationCode(
  env: Env,
  code: string,
  redirectUri: string,
  fetcher: SpotifyFetch = fetch,
): Promise<Response> {
  const response = await fetcher("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(env.SPOTIFY_CLIENT_ID + ":" + env.SPOTIFY_CLIENT_SECRET),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  if (!response.ok) return response;
  const data = await response.json() as SpotifyTokenResponse;
  if (!data.refresh_token) throw new Error("Spotify leverde geen refresh-token terug.");
  await saveSpotifyTokens(env, data.access_token, data.refresh_token, data.expires_in);
  return response;
}
