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

/** Extracts only Spotify's bounded, user-safe error message; never exposes headers or tokens. */
async function readSpotifyErrorDetail(response: Response): Promise<string | undefined> {
  const raw = (await response.text()).slice(0, 1000);
  if (!raw) return undefined;
  try {
    const payload = asRecord(JSON.parse(raw));
    const error = asRecord(payload?.error);
    const message = typeof error?.message === "string" ? error.message : undefined;
    const reason = typeof error?.reason === "string" ? error.reason : undefined;
    const detail = [message, reason && reason !== message ? "(" + reason + ")" : ""].filter(Boolean).join(" ");
    return (detail || raw).slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
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
      if (response.ok || response.status === 204) return { ok: true as const };
      return {
        ok: false as const,
        status: response.status,
        detail: await readSpotifyErrorDetail(response),
      };
    },
    async sendCommand(command: PlaybackCommand) {
      const response = await sendPlaybackCommand(client, command);
      if (response.ok || response.status === 204) return { ok: true as const };
      return {
        ok: false as const,
        status: response.status,
        detail: await readSpotifyErrorDetail(response),
      };
    },
  };
}
