import type {
  SpotifyCurrentPlayback,
  SpotifyPlaybackDevice,
  SpotifyPlaybackGateway,
  SpotifyPlaybackQueue,
  SpotifyPlaybackTrack,
} from "../../modules/playback/application/playback-ports";
import type { SpotifyPlaybackRequest } from "./playback-api";

type SpotifyWireTrack = {
  id?: string | null;
  uri?: string;
  name?: string;
  artists?: Array<{ name?: string }>;
  album?: { images?: Array<{ url?: string }> };
  duration_ms?: number;
};
type SpotifyWireDevice = {
  id?: string | null;
  name?: string;
  type?: string;
  is_active?: boolean;
  volume_percent?: number | null;
};
type SpotifyWirePlayback = {
  is_playing?: boolean;
  progress_ms?: number | null;
  item?: SpotifyWireTrack | null;
  device?: SpotifyWireDevice | null;
};
type SpotifyWireQueue = { queue?: SpotifyWireTrack[] };

function mapTrack(track: SpotifyWireTrack): SpotifyPlaybackTrack {
  return {
    id: track.id ?? null,
    uri: typeof track.uri === "string" ? track.uri : "",
    name: typeof track.name === "string" ? track.name : "Unknown track",
    artists: Array.isArray(track.artists) ? track.artists.map(artist => artist.name || "Unknown artist") : [],
    image: track.album?.images?.[0]?.url || null,
    durationMs: Number.isFinite(track.duration_ms) ? Number(track.duration_ms) : 0,
  };
}

function mapDevice(device: SpotifyWireDevice): SpotifyPlaybackDevice {
  return {
    id: device.id ?? null,
    name: device.name || "Unknown device",
    type: device.type || "Unknown",
    active: !!device.is_active,
    volume: typeof device.volume_percent === "number" ? device.volume_percent : null,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

/** Converts Spotify HTTP semantics (including 204) into stable application DTOs. */
export function createSpotifyPlaybackGateway(client: SpotifyPlaybackRequest): SpotifyPlaybackGateway {
  return {
    async getCurrentPlayback(): Promise<SpotifyCurrentPlayback> {
      const response = await client("/me/player");
      if (response.status === 204) return { kind: "no-active-device" };
      if (!response.ok) return { kind: "unavailable", status: response.status };
      const data = await readJson<SpotifyWirePlayback>(response);
      return {
        kind: "available",
        playing: !!data.is_playing,
        progressMs: typeof data.progress_ms === "number" ? data.progress_ms : 0,
        track: data.item ? mapTrack(data.item) : null,
        device: data.device ? mapDevice(data.device) : null,
      };
    },
    async getPlaybackQueue(): Promise<SpotifyPlaybackQueue> {
      const response = await client("/me/player/queue");
      if (!response.ok) return { kind: "unavailable", status: response.status };
      const data = await readJson<SpotifyWireQueue>(response);
      return {
        kind: "available",
        tracks: Array.isArray(data.queue) ? data.queue.map(mapTrack) : [],
      };
    },
  };
}
