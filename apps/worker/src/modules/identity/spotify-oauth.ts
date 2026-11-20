import type { Env } from "../../platform/env";
import { exchangeSpotifyAuthorizationCode } from "../../integrations/spotify/user-auth-service";

const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state",
].join(" ");

export function createSpotifyAuthorizationUrl(env: Pick<Env, "PUBLIC_ORIGIN" | "SPOTIFY_CLIENT_ID">, state: string): {
  url: string;
  redirectUri: string;
} {
  const redirectUri = env.PUBLIC_ORIGIN.replace(/\\/$/, "") + "/auth/spotify/callback";
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", env.SPOTIFY_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SPOTIFY_SCOPES);
  url.searchParams.set("state", state);
  return { url: url.toString(), redirectUri };
}

export function completeSpotifyAuthorization(
  env: Env,
  code: string,
  redirectUri: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  return exchangeSpotifyAuthorizationCode(env, code, redirectUri, fetcher);
}
