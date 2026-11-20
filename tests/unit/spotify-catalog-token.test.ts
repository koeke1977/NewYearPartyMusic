import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../apps/worker/src/platform/env";

describe("Spotify catalogue token service", () => {
  const env = {
    SPOTIFY_CLIENT_ID: "test-client-id",
    SPOTIFY_CLIENT_SECRET: "test-client-secret",
  } as Env;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests an app-level token using the client-credentials grant", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(new Response(
      JSON.stringify({ access_token: "catalogue-token", expires_in: 3600 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const { getSpotifyCatalogToken } = await import("../../apps/worker/src/integrations/spotify/catalog-token");

    await expect(getSpotifyCatalogToken(env)).resolves.toBe("catalogue-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://accounts.spotify.com/api/token", expect.objectContaining({
      method: "POST",
      body: "grant_type=client_credentials",
    }));
  });

  it("reuses a valid isolate-local token instead of making duplicate token requests", async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(new Response(
      JSON.stringify({ access_token: "cached-catalogue-token", expires_in: 3600 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const { getSpotifyCatalogToken } = await import("../../apps/worker/src/integrations/spotify/catalog-token");

    await expect(getSpotifyCatalogToken(env)).resolves.toBe("cached-catalogue-token");
    await expect(getSpotifyCatalogToken(env)).resolves.toBe("cached-catalogue-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when Spotify credentials are missing", async () => {
    const fetchMock = vi.mocked(fetch);
    const { getSpotifyCatalogToken } = await import("../../apps/worker/src/integrations/spotify/catalog-token");

    await expect(getSpotifyCatalogToken({ ...env, SPOTIFY_CLIENT_ID: "", SPOTIFY_CLIENT_SECRET: "" })).rejects.toThrow(
      "Spotify API is nog niet geconfigureerd.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces Spotify token endpoint failures", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("unauthorized", { status: 401 }));
    const { getSpotifyCatalogToken } = await import("../../apps/worker/src/integrations/spotify/catalog-token");

    await expect(getSpotifyCatalogToken(env)).rejects.toThrow("Spotify kon geen API-token leveren (HTTP 401).");
  });
});
