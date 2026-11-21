import { describe, expect, it, vi } from "vitest";
import { executeDjSpotifyCommand, listDjSpotifyDevices, setDjSpotifyVolume } from "../../apps/worker/src/modules/playback/application/dj-playback-controls";
import type { SpotifyPlaybackControlGateway } from "../../apps/worker/src/modules/playback/application/playback-ports";

describe("DJ Spotify playback controls", () => {
  it("returns mapped device data and handles unavailable Spotify", async () => {
    const gateway: SpotifyPlaybackControlGateway = {
      getDevices: async () => ({
        kind: "available",
        devices: [{ id: "device-1", name: "Speaker", type: "Speaker", active: true, volume: 70 }],
      }),
      setVolume: vi.fn(),
      sendCommand: vi.fn(),
    };
    await expect(listDjSpotifyDevices({ gateway })).resolves.toEqual({
      status: 200,
      body: { devices: [{ id: "device-1", name: "Speaker", type: "Speaker", is_active: true, volume_percent: 70 }] },
    });
    await expect(listDjSpotifyDevices({
      gateway: { ...gateway, getDevices: async () => ({ kind: "unavailable", status: 401 }) },
    })).resolves.toEqual({
      status: 502, body: { error: "Spotify-apparaten ophalen mislukt (HTTP 401)." },
    });
    await expect(listDjSpotifyDevices({
      gateway: { ...gateway, getDevices: async () => { throw new Error("network down"); } },
    })).resolves.toEqual({ status: 503, body: { error: "network down" } });
  });

  it("validates volume bounds before calling Spotify and accepts success", async () => {
    const setVolume = vi.fn(async () => ({ ok: true as const }));
    const gateway: SpotifyPlaybackControlGateway = {
      getDevices: vi.fn(),
      setVolume,
      sendCommand: vi.fn(),
    };
    expect(await setDjSpotifyVolume({ volume: -1, gateway })).toMatchObject({ status: 400 });
    expect(await setDjSpotifyVolume({ volume: 101, gateway })).toMatchObject({ status: 400 });
    expect(await setDjSpotifyVolume({ volume: 42.5, gateway })).toMatchObject({ status: 400 });
    expect(setVolume).not.toHaveBeenCalled();
    await expect(setDjSpotifyVolume({ volume: 42, gateway })).resolves.toEqual({
      status: 200, body: { ok: true, volume: 42 },
    });
    expect(setVolume).toHaveBeenCalledWith(42);
  });

  it("returns Spotify's 403 reason and actionable device guidance", async () => {
    const gateway: SpotifyPlaybackControlGateway = {
      getDevices: vi.fn(),
      setVolume: async () => ({
        ok: false, status: 403, detail: "Player command failed: Cannot control device volume (VOLUME_CONTROL_DISALLOW)",
      }),
      sendCommand: vi.fn(),
    };
    await expect(setDjSpotifyVolume({ volume: 40, gateway })).resolves.toEqual({
      status: 502,
      body: {
        error: "Spotify kon het volume niet aanpassen (HTTP 403). Spotify meldt: Player command failed: Cannot control device volume (VOLUME_CONTROL_DISALLOW) Controleer of het Spotify-account Premium heeft en of het actieve apparaat volumeregeling toestaat.",
      },
    });
  });

  it("maps failed volume commands without exposing provider response objects", async () => {
    const gateway: SpotifyPlaybackControlGateway = {
      getDevices: vi.fn(),
      setVolume: async () => ({ ok: false, status: 404 }),
      sendCommand: vi.fn(),
    };
    await expect(setDjSpotifyVolume({ volume: 40, gateway })).resolves.toEqual({
      status: 502,
      body: { error: "Spotify kon het volume niet aanpassen (HTTP 404). Controleer of een actief Spotify-apparaat beschikbaar is." },
    });
  });

  it("sets manual pause only after a successful Spotify play/pause command", async () => {
    const sendCommand = vi.fn(async () => ({ ok: true as const }));
    const gateway: SpotifyPlaybackControlGateway = {
      getDevices: vi.fn(),
      setVolume: vi.fn(),
      sendCommand,
    };
    const setManualPause = vi.fn(async () => {});
    await expect(executeDjSpotifyCommand({ action: "pause", gateway, setManualPause })).resolves.toEqual({
      status: 200, body: { ok: true },
    });
    expect(sendCommand).toHaveBeenCalledWith("pause");
    expect(setManualPause).toHaveBeenLastCalledWith(true);

    await executeDjSpotifyCommand({ action: "play", gateway, setManualPause });
    expect(setManualPause).toHaveBeenLastCalledWith(false);

    await executeDjSpotifyCommand({ action: "next", gateway, setManualPause });
    expect(setManualPause).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown commands and preserves bounded Spotify error detail", async () => {
    const sendCommand = vi.fn(async () => ({ ok: false as const, status: 404, detail: "device unavailable" }));
    const gateway: SpotifyPlaybackControlGateway = {
      getDevices: vi.fn(),
      setVolume: vi.fn(),
      sendCommand,
    };
    const setManualPause = vi.fn(async () => {});
    expect(await executeDjSpotifyCommand({ action: "shuffle", gateway, setManualPause })).toMatchObject({ status: 400 });
    expect(sendCommand).not.toHaveBeenCalled();

    await expect(executeDjSpotifyCommand({ action: "next", gateway, setManualPause })).resolves.toEqual({
      status: 502,
      body: { error: "Spotify-commando geweigerd (HTTP 404). device unavailable" },
    });
    expect(setManualPause).not.toHaveBeenCalled();
  });

  it("maps thrown transport and manual-pause persistence errors", async () => {
    const gateway: SpotifyPlaybackControlGateway = {
      getDevices: vi.fn(),
      setVolume: vi.fn(),
      sendCommand: async () => { throw new Error("Spotify offline"); },
    };
    await expect(executeDjSpotifyCommand({
      action: "pause", gateway, setManualPause: vi.fn(),
    })).resolves.toEqual({ status: 503, body: { error: "Spotify offline" } });

    await expect(executeDjSpotifyCommand({
      action: "pause",
      gateway: { ...gateway, sendCommand: async () => ({ ok: true }) },
      setManualPause: async () => { throw new Error("D1 offline"); },
    })).resolves.toEqual({ status: 503, body: { error: "D1 offline" } });
  });
});
