import type { Env } from "../env";
import { disconnectSpotifyAccount, exchangeSpotifyAuthorizationCode } from "../../integrations/spotify/user-auth-service";

/** Provider adapter for the OAuth authorization-code exchange and encrypted token persistence. */
export function completeSpotifyAuthorizationFromEnvironment(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<Response> {
  return exchangeSpotifyAuthorizationCode(env, code, redirectUri);
}


/** Deletes the persisted DJ Spotify connection through the integration boundary. */
export function disconnectSpotifyFromEnvironment(env: Env): Promise<boolean> {
  return disconnectSpotifyAccount(env);
}
