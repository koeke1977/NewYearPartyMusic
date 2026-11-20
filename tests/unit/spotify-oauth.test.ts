import { describe, expect, it, vi } from "vitest";
import { completeSpotifyAuthorization, createSpotifyAuthorizationUrl } from "../../apps/worker/src/modules/identity/spotify-oauth";
import * as userAuth from "../../apps/worker/src/integrations/spotify/user-auth-service";

describe("Spotify OAuth application boundary", () => {
  it("builds the authorization URL with the exact callback and minimum playback scopes", () => {
    const result = createSpotifyAuthorizationUrl({
      PUBLIC_ORIGIN: "https://partyqueue.example/",
      SPOTIFY_CLIENT_ID: "client-id",
    } as never, "secure-state");
    const url = new URL(result.url);
    expect(result.redirectUri).toBe("https://partyqueue.example/auth/spotify/callback");
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(result.redirectUri);
    expect(url.searchParams.get("state")).toBe("secure-state");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      "user-read-playback-state",
      "user-read-currently-playing",
      "user-modify-playback-state",
    ]);
  });

  it("delegates code exchange without changing the Spotify response", async () => {
    const response = new Response("invalid_grant", { status: 400 });
    const exchange = vi.spyOn(userAuth, "exchangeSpotifyAuthorizationCode").mockResolvedValue(response);
    const fetcher = vi.fn() as never;
    const result = await completeSpotifyAuthorization({} as never, "code", "https://callback", fetcher);
    expect(result).toBe(response);
    expect(exchange).toHaveBeenCalledWith({}, "code", "https://callback", fetcher);
    exchange.mockRestore();
  });
});
