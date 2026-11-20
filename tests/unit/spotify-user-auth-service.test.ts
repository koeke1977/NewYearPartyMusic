import { describe, expect, it, vi } from "vitest";
import { encryptSecret } from "../../apps/worker/src/platform/security/crypto";
import {
  exchangeSpotifyAuthorizationCode,
  spotifyFetch,
  spotifyUserToken,
} from "../../apps/worker/src/integrations/spotify/user-auth-service";

function fakeDb(firstValue: unknown = null) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    let values: unknown[] = [];
    const statement = {
      bind: (...args: unknown[]) => { values = args; return statement; },
      first: async () => { calls.push({ sql, values: [...values] }); return firstValue; },
      run: async () => { calls.push({ sql, values: [...values] }); return { meta: { changes: 1 } }; },
    };
    return statement;
  });
  return { db: { prepare } as never, calls };
}

const envBase = {
  SESSION_SECRET: "test-session-secret",
  SPOTIFY_CLIENT_ID: "client-id",
  SPOTIFY_CLIENT_SECRET: "client-secret",
} as const;

describe("Spotify user-auth service", () => {
  it("returns a decrypted, unexpired cached user token without refreshing", async () => {
    const accessEncrypted = await encryptSecret("cached-access-token", envBase.SESSION_SECRET);
    const refreshEncrypted = await encryptSecret("cached-refresh-token", envBase.SESSION_SECRET);
    const { db, calls } = fakeDb({
      access_token_enc: accessEncrypted,
      refresh_token_enc: refreshEncrypted,
      expires_at: Date.now() + 10 * 60_000,
    });
    const fetcher = vi.fn();
    const token = await spotifyUserToken({ ...envBase, DB: db } as never, fetcher as never);
    expect(token).toBe("cached-access-token");
    expect(fetcher).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("attaches the user token and passes the Spotify response through unchanged", async () => {
    const accessEncrypted = await encryptSecret("cached-access-token", envBase.SESSION_SECRET);
    const refreshEncrypted = await encryptSecret("cached-refresh-token", envBase.SESSION_SECRET);
    const { db } = fakeDb({
      access_token_enc: accessEncrypted,
      refresh_token_enc: refreshEncrypted,
      expires_at: Date.now() + 10 * 60_000,
    });
    const spotifyResponse = new Response("rate limited", { status: 429 });
    const fetcher = vi.fn(async () => spotifyResponse);
    const response = await spotifyFetch({ ...envBase, DB: db } as never, "/me/player", {}, fetcher as never);
    expect(response).toBe(spotifyResponse);
    expect(fetcher).toHaveBeenCalledWith("https://api.spotify.com/v1/me/player", {
      headers: { Authorization: "Bearer cached-access-token" },
    });
  });

  it("exchanges an authorization code and stores only encrypted token values", async () => {
    const { db, calls } = fakeDb();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      access_token: "plain-access",
      refresh_token: "plain-refresh",
      expires_in: 3600,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const response = await exchangeSpotifyAuthorizationCode(
      { ...envBase, DB: db } as never,
      "auth-code",
      "https://partyqueue.example/auth/spotify/callback",
      fetcher as never,
    );
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith("https://accounts.spotify.com/api/token", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Basic " + btoa("client-id:client-secret") }),
    }));
    const stored = calls.find((call) => call.sql.includes("INSERT INTO spotify_auth"));
    expect(stored).toBeDefined();
    expect(stored?.values[0]).not.toBe("plain-access");
    expect(stored?.values[1]).not.toBe("plain-refresh");
  });

  it("does not attempt to parse or persist credentials when Spotify rejects the code", async () => {
    const { db, calls } = fakeDb();
    const fetcher = vi.fn(async () => new Response("invalid_grant", { status: 400 }));
    const response = await exchangeSpotifyAuthorizationCode(
      { ...envBase, DB: db } as never,
      "bad-code",
      "https://partyqueue.example/auth/spotify/callback",
      fetcher as never,
    );
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
