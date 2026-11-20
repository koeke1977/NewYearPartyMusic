/** Commands understood by the playback application, independent of Spotify's HTTP API. */
export type PlaybackCommand = "play" | "pause" | "next" | "previous";

export type SpotifyPlaybackTrack = {
  id: string | null;
  uri: string;
  name: string;
  artists: string[];
  image: string | null;
  durationMs: number;
};

export type SpotifyPlaybackDevice = {
  id: string | null;
  name: string;
  type: string;
  active: boolean;
  volume: number | null;
};

export type SpotifyCurrentPlayback =
  | { kind: "no-active-device" }
  | { kind: "available"; playing: boolean; progressMs: number; track: SpotifyPlaybackTrack | null; device: SpotifyPlaybackDevice | null }
  | { kind: "unavailable"; status: number };

export type SpotifyPlaybackQueue =
  | { kind: "available"; tracks: SpotifyPlaybackTrack[] }
  | { kind: "unavailable"; status: number };

/** Typed application-facing gateway. HTTP and Spotify wire DTOs stay in the adapter. */
export interface SpotifyPlaybackGateway {
  getCurrentPlayback(): Promise<SpotifyCurrentPlayback>;
  getPlaybackQueue(): Promise<SpotifyPlaybackQueue>;
}

export type SpotifyPlaybackActionResult =
  | { ok: true }
  | { ok: false; status: number; detail?: string };

export type SpotifyPlaybackDevicesResult =
  | { kind: "available"; devices: SpotifyPlaybackDevice[] }
  | { kind: "unavailable"; status: number };

/** Application-facing control port; Spotify HTTP response objects stay in the integration adapter. */
export interface SpotifyPlaybackControlGateway {
  getDevices(): Promise<SpotifyPlaybackDevicesResult>;
  setVolume(volume: number): Promise<SpotifyPlaybackActionResult>;
  sendCommand(command: PlaybackCommand): Promise<SpotifyPlaybackActionResult>;
}
