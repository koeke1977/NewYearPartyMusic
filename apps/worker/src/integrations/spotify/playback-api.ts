import type { PlaybackCommand } from "../../modules/playback/application/playback-ports";
export type { PlaybackCommand } from "../../modules/playback/application/playback-ports";

export type SpotifyPlaybackRequest = (path: string, init?: RequestInit) => Promise<Response>;

const jsonHeaders = { "Content-Type": "application/json" };

export function getCurrentPlayback(client: SpotifyPlaybackRequest): Promise<Response> {
  return client("/me/player");
}

export function getPlaybackQueue(client: SpotifyPlaybackRequest): Promise<Response> {
  return client("/me/player/queue");
}

export function getPlaybackDevices(client: SpotifyPlaybackRequest): Promise<Response> {
  return client("/me/player/devices");
}

export function setPlaybackVolume(client: SpotifyPlaybackRequest, volume: number): Promise<Response> {
  return client("/me/player/volume?volume_percent=" + volume, { method: "PUT" });
}

export function setPlaybackShuffle(client: SpotifyPlaybackRequest, enabled: boolean): Promise<Response> {
  return client("/me/player/shuffle?state=" + String(enabled), { method: "PUT" });
}

export function playTrack(client: SpotifyPlaybackRequest, trackUri: string): Promise<Response> {
  return client("/me/player/play", {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({ uris: [trackUri] }),
  });
}

export function playPlaylist(client: SpotifyPlaybackRequest, playlistUri: string): Promise<Response> {
  return client("/me/player/play", {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({ context_uri: playlistUri }),
  });
}

const transportCommands: Record<PlaybackCommand, { method: string; path: string }> = {
  play: { method: "PUT", path: "/me/player/play" },
  pause: { method: "PUT", path: "/me/player/pause" },
  next: { method: "POST", path: "/me/player/next" },
  previous: { method: "POST", path: "/me/player/previous" },
};

export function sendPlaybackCommand(client: SpotifyPlaybackRequest, command: PlaybackCommand): Promise<Response> {
  const request = transportCommands[command];
  return client(request.path, { method: request.method });
}
