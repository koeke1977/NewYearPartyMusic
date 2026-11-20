import type {
  SpotifyPlaybackGateway,
  SpotifyPlaybackTrack,
} from "./playback-ports";

export type PlaybackAdvanceResult = { advanced: boolean; error?: string };
export type SpotifyPlaybackStatusDependencies = {
  gateway: SpotifyPlaybackGateway;
  maybeAdvance(playing: boolean): Promise<PlaybackAdvanceResult>;
  maybeStartFallback(trackUri: string | null, playing: boolean, progressMs: number, durationMs: number): Promise<boolean>;
  readFallbackError(): Promise<string | null>;
  clearManualPause(): Promise<void>;
};

export type SpotifyPlaybackStatusResult = {
  status: 200 | 502 | 503;
  body: Record<string, unknown>;
};

function toTrackView(track: SpotifyPlaybackTrack) {
  return {
    id: track.id, uri: track.uri, name: track.name,
    artists: track.artists, image: track.image, durationMs: track.durationMs,
  };
}

/** Playback policy depends on typed Spotify results, never on Fetch Response objects. */
export async function getDjSpotifyPlaybackStatus(
  dependencies: SpotifyPlaybackStatusDependencies,
): Promise<SpotifyPlaybackStatusResult> {
  try {
    const current = await dependencies.gateway.getCurrentPlayback();
    if (current.kind === "unavailable") {
      return {
        status: 502,
        body: { error: "Spotify playbackstatus niet beschikbaar (HTTP " + current.status + ")." },
      };
    }

    if (current.kind === "no-active-device") {
      const fallbackActive = await dependencies.maybeStartFallback(null, false, 0, 0);
      const autoAdvance = await dependencies.maybeAdvance(false);
      const fallbackError = await dependencies.readFallbackError();
      return {
        status: 200,
        body: {
          connected: true, playing: false, device: null, track: null, nextTrack: null,
          fallbackActive, autoAdvanced: autoAdvance.advanced,
          autoAdvanceError: autoAdvance.error || null, fallbackError,
        },
      };
    }

    const { playing, progressMs, track, device } = current;
    if (playing) await dependencies.clearManualPause();
    const autoAdvance = await dependencies.maybeAdvance(playing);
    const fallbackActive = await dependencies.maybeStartFallback(
      track?.uri || null, playing, progressMs, track?.durationMs || 0,
    );
    const fallbackError = await dependencies.readFallbackError();

    let nextTrack: ReturnType<typeof toTrackView> | null = null;
    if (fallbackActive) {
      const queue = await dependencies.gateway.getPlaybackQueue();
      if (queue.kind === "available" && queue.tracks[0]) nextTrack = toTrackView(queue.tracks[0]);
    }

    return {
      status: 200,
      body: {
        connected: true, playing, progressMs, fallbackActive,
        autoAdvanced: autoAdvance.advanced, autoAdvanceError: autoAdvance.error || null,
        nextTrack, fallbackError, device, track: track ? toTrackView(track) : null,
      },
    };
  } catch (error) {
    return {
      status: 503,
      body: { connected: false, error: error instanceof Error ? error.message : "Spotify niet verbonden." },
    };
  }
}
