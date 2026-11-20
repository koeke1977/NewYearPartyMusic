import { describe, expect, it, vi } from "vitest";
import { createSpotifyAuthorizationUrl, spotifyOAuthRedirectUri } from "../../apps/worker/src/modules/identity/spotify-oauth";
import { completeSpotifyAuthorizationFromEnvironment } from "../../apps/worker/src/platform/composition/spotify-oauth";
import * as userAuth from "../../apps/worker/src/integrations/spotify/user-auth-service";
import type { Env } from "../../apps/worker/src/platform/env";

describe("Spotify OAuth application and provider boundary", () => {
  it("builds the authorization URL with the exact callback and minimum playback scopes", () => {
    const redirectUri = spotifyOAuthRedirectUri("https://partyqueue.example/");
    const result = createSpotifyAuthorizationUrl({
      publicOrigin: "https://partyqueue.example/",
      clientId: "client-id",
    }, "secure-state");
    const url = new URL(result.url);
    expect(redirectUri).toBe("https://partyqueue.example/auth/spotify/callback");
    expect(result.redirectUri).toBe(redirectUri);
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(url.searchParams.get("state")).toBe("secure-state");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "user-read-playback-state",
      "user-read-currently-playing",
      "user-modify-playback-state",
    ]);
  });

  it("delegates code exchange through the platform adapter without changing the Spotify response", async () => {
    const response = new Response("invalid_grant", { status: 400 });
    const exchange = vi.spyOn(userAuth, "exchangeSpotifyAuthorizationCode").mockResolvedValue(response);
    const env = { DB: {} as D1Database, SESSION_SECRET: "secret" } as Env;
    const result = await completeSpotifyAuthorizationFromEnvironment(env, "code", "https://callback");
    expect(result).toBe(response);
    expect(exchange).toHaveBeenCalledWith(env, "code", "https://callback");
    exchange.mockRestore();
  });
});
