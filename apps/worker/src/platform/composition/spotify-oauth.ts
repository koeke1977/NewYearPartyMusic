import type { Env } from "../env";
import { exchangeSpotifyAuthorizationCode } from "../../integrations/spotify/user-auth-service";

/** Provider adapter for the OAuth authorization-code exchange and encrypted token persistence. */
export function completeSpotifyAuthorizationFromEnvironment(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<Response> {
  return exchangeSpotifyAuthorizationCode(env, code, redirectUri);
}
