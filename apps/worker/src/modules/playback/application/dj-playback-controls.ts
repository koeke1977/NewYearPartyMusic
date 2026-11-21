import type {
  PlaybackCommand,
  SpotifyPlaybackControlGateway,
} from "./playback-ports";

type Result = { status: 200 | 400 | 502 | 503; body: Record<string, unknown> };

export async function listDjSpotifyDevices(input: {
  gateway: SpotifyPlaybackControlGateway;
}): Promise<Result> {
  try {
    const result = await input.gateway.getDevices();
    if (result.kind === "unavailable") {
      return { status: 502, body: { error: "Spotify-apparaten ophalen mislukt (HTTP " + result.status + ")." } };
    }
    return {
      status: 200,
      body: {
        devices: result.devices.map(device => ({
          id: device.id,
          name: device.name,
          type: device.type,
          is_active: device.active,
          volume_percent: device.volume,
        })),
      },
    };
  } catch (error) {
    return { status: 503, body: { error: error instanceof Error ? error.message : "Spotify niet beschikbaar." } };
  }
}

export async function setDjSpotifyVolume(input: {
  volume: unknown;
  gateway: SpotifyPlaybackControlGateway;
}): Promise<Result> {
  if (typeof input.volume !== "number" || !Number.isInteger(input.volume) || input.volume < 0 || input.volume > 100) {
    return { status: 400, body: { error: "Volume moet een geheel getal tussen 0 en 100 zijn." } };
  }
  try {
    const result = await input.gateway.setVolume(input.volume);
    if (!result.ok) {
      const detail = result.detail ? " Spotify meldt: " + result.detail : "";
      const guidance = result.status === 403
        ? " Controleer of het Spotify-account Premium heeft en of het actieve apparaat volumeregeling toestaat."
        : " Controleer of een actief Spotify-apparaat beschikbaar is.";
      return {
        status: 502,
        body: { error: "Spotify kon het volume niet aanpassen (HTTP " + result.status + ")." + detail + guidance },
      };
    }
    return { status: 200, body: { ok: true, volume: input.volume } };
  } catch (error) {
    return { status: 503, body: { error: error instanceof Error ? error.message : "Spotify-volume aanpassen is mislukt." } };
  }
}

export async function executeDjSpotifyCommand(input: {
  action: string;
  gateway: SpotifyPlaybackControlGateway;
  setManualPause(paused: boolean): Promise<void>;
}): Promise<Result> {
  const allowed: readonly string[] = ["play", "pause", "next", "previous"];
  if (!allowed.includes(input.action)) {
    return { status: 400, body: { error: "Onbekend Spotify-commando." } };
  }
  try {
    const action = input.action as PlaybackCommand;
    const result = await input.gateway.sendCommand(action);
    if (!result.ok) {
      return {
        status: 502,
        body: { error: "Spotify-commando geweigerd (HTTP " + result.status + "). " + (result.detail || "") },
      };
    }
    if (action === "pause") await input.setManualPause(true);
    if (action === "play") await input.setManualPause(false);
    return { status: 200, body: { ok: true } };
  } catch (error) {
    return { status: 503, body: { error: error instanceof Error ? error.message : "Spotify-commando mislukt." } };
  }
}
