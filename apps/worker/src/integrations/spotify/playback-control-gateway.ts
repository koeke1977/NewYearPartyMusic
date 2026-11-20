import type {
  PlaybackCommand,
  SpotifyPlaybackControlGateway,
  SpotifyPlaybackDevice,
} from "../../modules/playback/application/playback-ports";
import type { SpotifyPlaybackRequest } from "./playback-api";
import { getPlaybackDevices, sendPlaybackCommand, setPlaybackVolume } from "./playback-api";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function mapDevice(value: unknown): SpotifyPlaybackDevice {
  const device = asRecord(value) || {};
  return {
    id: typeof device.id === "string" ? device.id : null,
    name: typeof device.name === "string" ? device.name : "Unknown device",
    type: typeof device.type === "string" ? device.type : "Unknown",
    active: device.is_active === true,
    volume: typeof device.volume_percent === "number" ? device.volume_percent : null,
  };
}

/** Converts Spotify playback-control HTTP responses into application-owned results. */
export function createSpotifyPlaybackControlGateway(client: SpotifyPlaybackRequest): SpotifyPlaybackControlGateway {
  return {
    async getDevices() {
      const response = await getPlaybackDevices(client);
      if (!response.ok) return { kind: "unavailable" as const, status: response.status };
      const payload = asRecord(await response.json());
      const devices = Array.isArray(payload?.devices) ? payload.devices.map(mapDevice) : [];
      return { kind: "available" as const, devices };
    },
    async setVolume(volume: number) {
      const response = await setPlaybackVolume(client, volume);
      return response.ok || response.status === 204
        ? { ok: true as const }
        : { ok: false as const, status: response.status };
    },
    async sendCommand(command: PlaybackCommand) {
      const response = await sendPlaybackCommand(client, command);
      if (response.ok || response.status === 204) return { ok: true as const };
      const detail = (await response.text()).slice(0, 400);
      return { ok: false as const, status: response.status, detail };
    },
  };
}
