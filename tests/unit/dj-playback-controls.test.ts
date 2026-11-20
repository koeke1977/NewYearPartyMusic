import { describe, expect, it, vi } from "vitest";
import { executeDjSpotifyCommand, listDjSpotifyDevices, setDjSpotifyVolume } from "../../apps/worker/src/modules/playback/application/dj-playback-controls";

describe("DJ Spotify playback controls", () => {
  it("returns device data and maps Spotify failures", async () => {
    const payload = { devices: [{ id: "device-1", name: "Speaker" }] };
    const getDevices = vi.fn(async () => Response.json(payload));
    await expect(listDjSpotifyDevices({ getDevices })).resolves.toEqual({ status: 200, body: payload });
    await expect(listDjSpotifyDevices({
      getDevices: async () => new Response(null, { status: 401 }),
    })).resolves.toEqual({
      status: 502, body: { error: "Spotify-apparaten ophalen mislukt (HTTP 401)." },
    });
    await expect(listDjSpotifyDevices({
      getDevices: async () => { throw new Error("network down"); },
    })).resolves.toEqual({ status: 503, body: { error: "network down" } });
  });

  it("validates volume bounds before calling Spotify and accepts 204", async () => {
    const setVolume = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await setDjSpotifyVolume({ volume: -1, setVolume })).toMatchObject({ status: 400 });
    expect(await setDjSpotifyVolume({ volume: 101, setVolume })).toMatchObject({ status: 400 });
    expect(await setDjSpotifyVolume({ volume: 42.5, setVolume })).toMatchObject({ status: 400 });
    expect(setVolume).not.toHaveBeenCalled();
    await expect(setDjSpotifyVolume({ volume: 42, setVolume })).resolves.toEqual({
      status: 200, body: { ok: true, volume: 42 },
    });
    expect(setVolume).toHaveBeenCalledWith(42);
  });

  it("sets manual pause only after a successful Spotify play/pause command", async () => {
    const sendCommand = vi.fn(async () => new Response(null, { status: 204 }));
    const setManualPause = vi.fn(async () => {});
    await expect(executeDjSpotifyCommand({ action: "pause", sendCommand, setManualPause })).resolves.toEqual({
      status: 200, body: { ok: true },
    });
    expect(setCommandArgs(sendCommand)).toEqual(["pause"]);
    expect(setManualPause).toHaveBeenLastCalledWith(true);

    await executeDjSpotifyCommand({ action: "play", sendCommand, setManualPause });
    expect(setManualPause).toHaveBeenLastCalledWith(false);

    await executeDjSpotifyCommand({ action: "next", sendCommand, setManualPause });
    expect(setManualPause).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown commands and preserves Spotify error detail", async () => {
    const sendCommand = vi.fn(async () => new Response("device unavailable", { status: 404 }));
    const setManualPause = vi.fn(async () => {});
    expect(await executeDjSpotifyCommand({ action: "shuffle", sendCommand, setManualPause })).toMatchObject({ status: 400 });
    expect(sendCommand).not.toHaveBeenCalled();

    await expect(executeDjSpotifyCommand({ action: "next", sendCommand, setManualPause })).resolves.toEqual({
      status: 502,
      body: { error: "Spotify-commando geweigerd (HTTP 404). device unavailable" },
    });
    expect(setManualPause).not.toHaveBeenCalled();
  });

  it("maps thrown transport and manual-pause persistence errors", async () => {
    await expect(executeDjSpotifyCommand({
      action: "pause",
      sendCommand: async () => { throw new Error("Spotify offline"); },
      setManualPause: vi.fn(),
    })).resolves.toEqual({ status: 503, body: { error: "Spotify offline" } });

    await expect(executeDjSpotifyCommand({
      action: "pause",
      sendCommand: async () => new Response(null, { status: 204 }),
      setManualPause: async () => { throw new Error("D1 offline"); },
    })).resolves.toEqual({ status: 503, body: { error: "D1 offline" } });
  });
});

function setCommandArgs(mock: ReturnType<typeof vi.fn>): unknown[] {
  return mock.mock.calls.map(call => call[0]);
}
