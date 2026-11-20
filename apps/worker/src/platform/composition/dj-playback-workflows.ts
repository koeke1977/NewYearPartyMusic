import type { Env } from "../env";
import { spotifyFetch } from "../../integrations/spotify/user-auth-service";
import {
  getPlaybackDevices, playPlaylist, playTrack, sendPlaybackCommand,
  setPlaybackShuffle, setPlaybackVolume,
} from "../../integrations/spotify/playback-api";
import { createSpotifyPlaybackGateway } from "../../integrations/spotify/playback-status-gateway";
import type { PlaybackCommand } from "../../modules/playback/application/playback-ports";
import { getDjSpotifyPlaybackStatus } from "../../modules/playback/application/get-dj-spotify-playback-status";
import {
  executeDjSpotifyCommand, listDjSpotifyDevices, setDjSpotifyVolume,
} from "../../modules/playback/application/dj-playback-controls";
import { dispatchNextTrack } from "../../modules/queue/application/dispatch-next-track";
import { createQueueDispatchRepository } from "../../modules/queue/infrastructure/queue-dispatch-d1-repository";
import {
  maybeAdvancePartyQueue as runQueueAdvancement,
  maybeStartSpotifyFallback as runSpotifyFallbackPolicy,
} from "../../modules/playback/application/playback-automation";
import {
  createPlaybackPolicyRepository, readSpotifyFallbackError,
  setSpotifyFallbackActive, setSpotifyManualPause,
} from "../../modules/playback/infrastructure/playback-policy-repository";

const SPOTIFY_FALLBACK_PLAYLIST_URI = "spotify:playlist:37i9dQZF1DXa2PvUpywmrr";

async function startSpotifyFallback(env: Env): Promise<void> {
  const client = spotifyFetch.bind(null, env);
  const shuffle = await setPlaybackShuffle(client, true);
  if (!shuffle.ok && shuffle.status !== 204) {
    throw new Error("Spotify shuffle inschakelen mislukt (HTTP " + shuffle.status + ").");
  }
  const play = await playPlaylist(client, SPOTIFY_FALLBACK_PLAYLIST_URI);
  if (!play.ok && play.status !== 204) {
    throw new Error("Spotify Party Hits starten mislukt (HTTP " + play.status + ").");
  }
  await setSpotifyFallbackActive(env.DB);
}

/** Wires the authoritative queue-dispatch use case to D1 and Spotify playback. */
export async function startNextPartyQueueRequest(env: Env): Promise<{
  ok: boolean; busy?: boolean; track?: { name: string; artist: string }; requestId?: string; error?: string;
}> {
  const client = spotifyFetch.bind(null, env);
  return dispatchNextTrack({
    repository: createQueueDispatchRepository(env.DB),
    eventId: env.EVENT_ID,
    playTrack: async (trackUri) => {
      const response = await playTrack(client, trackUri);
      return { ok: response.ok, status: response.status };
    },
  });
}

export function maybeAdvancePartyQueue(env: Env, playing: boolean): Promise<{ advanced: boolean; error?: string }> {
  return runQueueAdvancement({
    repository: createPlaybackPolicyRepository(env.DB),
    eventId: env.EVENT_ID,
    dispatchNext: async () => {
      const result = await startNextPartyQueueRequest(env);
      return { ok: result.ok, busy: result.busy, error: result.error };
    },
  }, playing);
}

export function maybeStartSpotifyFallback(
  env: Env,
  currentTrackUri: string | null,
  playing: boolean,
  _progressMs: number,
  _currentDurationMs: number,
): Promise<boolean> {
  return runSpotifyFallbackPolicy({
    repository: createPlaybackPolicyRepository(env.DB),
    eventId: env.EVENT_ID,
    startFallback: () => startSpotifyFallback(env),
  }, currentTrackUri, playing);
}

/** Composes playback status, preserving its existing auto-advance/fallback side effects. */
export function getDjSpotifyPlaybackStatusFromEnvironment(env: Env) {
  const client = spotifyFetch.bind(null, env);
  return getDjSpotifyPlaybackStatus({
    gateway: createSpotifyPlaybackGateway(client),
    maybeAdvance: (playing) => maybeAdvancePartyQueue(env, playing),
    maybeStartFallback: (trackUri, playing, progressMs, durationMs) =>
      maybeStartSpotifyFallback(env, trackUri, playing, progressMs, durationMs),
    readFallbackError: () => readSpotifyFallbackError(env.DB),
    clearManualPause: () => setSpotifyManualPause(env.DB, false),
  });
}

export function listDjSpotifyDevicesFromEnvironment(env: Env) {
  const client = spotifyFetch.bind(null, env);
  return listDjSpotifyDevices({ getDevices: () => getPlaybackDevices(client) });
}

export function setDjSpotifyVolumeFromEnvironment(env: Env, volume: unknown) {
  const client = spotifyFetch.bind(null, env);
  return setDjSpotifyVolume({ volume, setVolume: (value) => setPlaybackVolume(client, value) });
}

export function executeDjSpotifyCommandFromEnvironment(env: Env, action: string) {
  const client = spotifyFetch.bind(null, env);
  return executeDjSpotifyCommand({
    action,
    sendCommand: (command: PlaybackCommand) => sendPlaybackCommand(client, command),
    setManualPause: (paused) => setSpotifyManualPause(env.DB, paused),
  });
}
