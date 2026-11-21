import { describe, expect, it, vi } from "vitest";
import { createSpotifyPlaybackControlGateway } from "../../apps/worker/src/integrations/spotify/playback-control-gateway";

describe("Spotify playback control gateway", () => {
  it("normalizes Spotify devices into the application-owned device contract", async () => {
    const client = vi.fn(async () => Response.json({
      devices: [{ id: "device-1", name: "Speaker", type: "Speaker", is_active: true, volume_percent: 65 }],
    }));
    const gateway = createSpotifyPlaybackControlGateway(client);
    await expect(gateway.getDevices()).resolves.toEqual({
      kind: "available",
      devices: [{ id: "device-1", name: "Speaker", type: "Speaker", active: true, volume: 65 }],
    });
    expect(client).toHaveBeenCalledWith("/me/player/devices");
  });

  it("maps device endpoint failures into typed results", async () => {
    const gateway = createSpotifyPlaybackControlGateway(async () => new Response(null, { status: 401 }));
    await expect(gateway.getDevices()).resolves.toEqual({ kind: "unavailable", status: 401 });
  });

  it("maps successful volume and transport responses without leaking Response", async () => {
    const client = vi.fn(async () => new Response(null, { status: 204 }));
    const gateway = createSpotifyPlaybackControlGateway(client);
    await expect(gateway.setVolume(42)).resolves.toEqual({ ok: true });
    await expect(gateway.sendCommand("pause")).resolves.toEqual({ ok: true });
    expect(client).toHaveBeenNthCalledWith(1, "/me/player/volume?volume_percent=42", { method: "PUT" });
    expect(client).toHaveBeenNthCalledWith(2, "/me/player/pause", { method: "PUT" });
  });

  it("preserves Spotify's bounded 403 reason for volume failures", async () => {
    const gateway = createSpotifyPlaybackControlGateway(async () => Response.json({
      error: { status: 403, message: "Player command failed: Cannot control device volume", reason: "VOLUME_CONTROL_DISALLOW" },
    }, { status: 403 }));
    await expect(gateway.setVolume(42)).resolves.toEqual({
      ok: false, status: 403,
      detail: "Player command failed: Cannot control device volume (VOLUME_CONTROL_DISALLOW)",
    });
  });

  it("bounds non-JSON provider error details", async () => {
    const gateway = createSpotifyPlaybackControlGateway(async () => new Response("x".repeat(500), { status: 503 }));
    await expect(gateway.setVolume(42)).resolves.toEqual({
      ok: false, status: 503, detail: "x".repeat(300),
    });
  });

  it("preserves bounded error details for failed transport commands", async () => {
    const detail = "x".repeat(500);
    const gateway = createSpotifyPlaybackControlGateway(async () => new Response(detail, { status: 404 }));
    await expect(gateway.sendCommand("next")).resolves.toEqual({
      ok: false, status: 404, detail: "x".repeat(300),
    });
  });
});
