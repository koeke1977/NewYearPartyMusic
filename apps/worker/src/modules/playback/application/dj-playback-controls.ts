import type { PlaybackCommand } from "../../../integrations/spotify/playback-api";

type Result = { status: 200 | 400 | 502 | 503; body: Record<string, unknown> };

export async function listDjSpotifyDevices(input: {
  getDevices(): Promise<Response>;
}): Promise<Result> {
  try {
    const response = await input.getDevices();
    if (!response.ok) return { status: 502, body: { error: "Spotify-apparaten ophalen mislukt (HTTP " + response.status + ")." } };
    return { status: 200, body: await response.json() as Record<string, unknown> };
  } catch (error) {
    return { status: 503, body: { error: error instanceof Error ? error.message : "Spotify niet beschikbaar." } };
  }
}

export async function setDjSpotifyVolume(input: {
  volume: unknown;
  setVolume(volume: number): Promise<Response>;
}): Promise<Result> {
  if (typeof input.volume !== "number" || !Number.isInteger(input.volume) || input.volume < 0 || input.volume > 100) {
    return { status: 400, body: { error: "Volume moet een geheel getal tussen 0 en 100 zijn." } };
  }
  try {
    const response = await input.setVolume(input.volume);
    if (!response.ok && response.status !== 204) {
      return {
        status: 502,
        body: { error: "Spotify kon het volume niet aanpassen (HTTP " + response.status + "). Controleer of een actief Spotify-apparaat beschikbaar is." },
      };
    }
    return { status: 200, body: { ok: true, volume: input.volume } };
  } catch (error) {
    return { status: 503, body: { error: error instanceof Error ? error.message : "Spotify-volume aanpassen is mislukt." } };
  }
}

export async function executeDjSpotifyCommand(input: {
  action: string;
  sendCommand(action: SpotifyTransportAction): Promise<Response>;
  setManualPause(paused: boolean): Promise<void>;
}): Promise<Result> {
  const allowed: readonly string[] = ["play", "pause", "next", "previous"];
  if (!allowed.includes(input.action)) {
    return { status: 400, body: { error: "Onbekend Spotify-commando." } };
  }
  try {
    const action = input.action as SpotifyTransportAction;
    const response = await input.sendCommand(action);
    if (!response.ok && response.status !== 204) {
      const detail = (await response.text()).slice(0, 400);
      return { status: 502, body: { error: "Spotify-commando geweigerd (HTTP " + response.status + "). " + detail } };
    }
    if (action === "pause") await input.setManualPause(true);
    if (action === "play") await input.setManualPause(false);
    return { status: 200, body: { ok: true } };
  } catch (error) {
    return { status: 503, body: { error: error instanceof Error ? error.message : "Spotify-commando mislukt." } };
  }
}
