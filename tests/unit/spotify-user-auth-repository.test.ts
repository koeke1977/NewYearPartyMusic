import { describe, expect, it, vi } from "vitest";
import {
  claimSpotifyRefreshLock,
  deleteEncryptedSpotifyTokens,
  invalidateSpotifyAccessToken,
  readEncryptedSpotifyTokens,
  releaseSpotifyRefreshLock,
  saveEncryptedSpotifyTokens,
} from "../../apps/worker/src/integrations/spotify/user-auth-repository";

function fakeDb(options: { first?: unknown; changes?: number } = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    let values: unknown[] = [];
    const statement = {
      bind: (...args: unknown[]) => { values = args; return statement; },
      first: async () => {
        calls.push({ sql, values: [...values] });
        return options.first ?? null;
      },
      run: async () => {
        calls.push({ sql, values: [...values] });
        return { meta: { changes: options.changes ?? 1 } };
      },
    };
    return statement;
  });
  return { db: { prepare } as never, calls, prepare };
}

describe("Spotify user-auth repository", () => {
  it("stores encrypted token values and expiry without handling plaintext credentials", async () => {
    const { db, calls } = fakeDb();
    await saveEncryptedSpotifyTokens(db, "enc-access", "enc-refresh", 123456);
    expect(calls[0].sql).toContain("INSERT INTO spotify_auth");
    expect(calls[0].values).toEqual(["enc-access", "enc-refresh", 123456]);
  });

  it("reads the current encrypted token pair", async () => {
    const row = { access_token_enc: "a", refresh_token_enc: "r", expires_at: 123 };
    const { db, calls } = fakeDb({ first: row });
    await expect(readEncryptedSpotifyTokens(db)).resolves.toEqual(row);
    expect(calls[0].sql).toContain("WHERE id='main'");
  });

  it("claims the refresh lease only when the atomic D1 write changes a row", async () => {
    const { db: allowed } = fakeDb({ changes: 1 });
    const { db: busy } = fakeDb({ changes: 0 });
    await expect(claimSpotifyRefreshLock(allowed, "owner-1")).resolves.toBe(true);
    await expect(claimSpotifyRefreshLock(busy, "owner-2")).resolves.toBe(false);
  });

  it("releases only the lease owned by the current request", async () => {
    const { db, calls } = fakeDb();
    await releaseSpotifyRefreshLock(db, "owner-3");
    expect(calls[0].sql).toContain("DELETE FROM settings");
    expect(calls[0].values).toEqual(["owner-3"]);
  });

  it("deletes stored Spotify credentials and the refresh lease on disconnect", async () => {
    const { db, calls } = fakeDb({ changes: 1 });
    await expect(deleteEncryptedSpotifyTokens(db)).resolves.toBe(true);
    expect(calls[0].sql).toContain("DELETE FROM spotify_auth");
    expect(calls[0].sql).toContain("NOT EXISTS");
    expect(calls[1].sql).toBe("DELETE FROM settings WHERE key='spotify_token_refresh_lock'");
  });

  it("does not disconnect while a token refresh lease is active", async () => {
    const { db, calls } = fakeDb({
      changes: 0,
      first: { access_token_enc: "a", refresh_token_enc: "r", expires_at: 123 },
    });
    await expect(deleteEncryptedSpotifyTokens(db)).resolves.toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls[1].sql).toContain("SELECT access_token_enc");
  });

  it("invalidates the access-token expiry after a Spotify 401", async () => {
    const { db, calls } = fakeDb();
    await invalidateSpotifyAccessToken(db);
    expect(calls[0].sql).toBe("UPDATE spotify_auth SET expires_at=0 WHERE id='main'");
  });
});
