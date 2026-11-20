export type PlaybackAdvanceResult = { advanced: boolean; error?: string };
export type SpotifyPlaybackStatusDependencies = {
  getCurrentPlayback(): Promise<Response>;
  getPlaybackQueue(): Promise<Response>;
  maybeAdvance(playing: boolean): Promise<PlaybackAdvanceResult>;
  maybeStartFallback(trackUri: string | null, playing: boolean, progressMs: number, durationMs: number): Promise<boolean>;
  readFallbackError(): Promise<string | null>;
  clearManualPause(): Promise<void>;
};

type SpotifyArtist = { name: string };
type SpotifyImage = { url: string };
type SpotifyAlbum = { images?: SpotifyImage[] };
type SpotifyTrack = {
  id: string | null;
  uri: string;
  name: string;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
  duration_ms: number;
};
type SpotifyDevice = {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
};
type SpotifyPlaybackPayload = {
  is_playing?: boolean;
  progress_ms?: number | null;
  item?: SpotifyTrack | null;
  device?: SpotifyDevice | null;
};
type SpotifyQueuePayload = { queue?: SpotifyTrack[] };

type PlaybackTrackView = {
  id: string | null;
  uri: string;
  name: string;
  artists: string[];
  image: string | null;
  durationMs: number;
};
type PlaybackDeviceView = {
  id: string | null;
  name: string;
  type: string;
  active: boolean;
  volume: number | null;
};

export type SpotifyPlaybackStatusResult = {
  status: 200 | 502 | 503;
  body: Record<string, unknown>;
};

function toTrackView(track: SpotifyTrack): PlaybackTrackView {
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: (track.artists || []).map(artist => artist.name),
    image: track.album?.images?.[0]?.url || null,
    durationMs: track.duration_ms,
  };
}

export async function getDjSpotifyPlaybackStatus(
  dependencies: SpotifyPlaybackStatusDependencies,
): Promise<SpotifyPlaybackStatusResult> {
  try {
    const response = await dependencies.getCurrentPlayback();
    if (response.status === 204) {
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
    if (!response.ok) {
      return {
        status: 502,
        body: { error: "Spotify playbackstatus niet beschikbaar (HTTP " + response.status + ")." },
      };
    }

    const data = await response.json() as SpotifyPlaybackPayload;
    const item = data.item || null;
    const playing = !!data.is_playing;
    const progressMs = data.progress_ms || 0;
    if (playing) await dependencies.clearManualPause();

    const autoAdvance = await dependencies.maybeAdvance(playing);
    const fallbackActive = await dependencies.maybeStartFallback(
      item?.uri || null, playing, progressMs, item?.duration_ms || 0,
    );
    const fallbackError = await dependencies.readFallbackError();

    let nextTrack: PlaybackTrackView | null = null;
    if (fallbackActive) {
      const queueResponse = await dependencies.getPlaybackQueue();
      if (queueResponse.ok) {
        const queueData = await queueResponse.json() as SpotifyQueuePayload;
        const upcoming = queueData.queue?.[0];
        if (upcoming) nextTrack = toTrackView(upcoming);
      }
    }

    const device = data.device ? {
      id: data.device.id, name: data.device.name, type: data.device.type,
      active: data.device.is_active, volume: data.device.volume_percent,
    } satisfies PlaybackDeviceView : null;

    return {
      status: 200,
      body: {
        connected: true, playing, progressMs, fallbackActive,
        autoAdvanced: autoAdvance.advanced, autoAdvanceError: autoAdvance.error || null,
        nextTrack, fallbackError, device, track: item ? toTrackView(item) : null,
      },
    };
  } catch (error) {
    return {
      status: 503,
      body: { connected: false, error: error instanceof Error ? error.message : "Spotify niet verbonden." },
    };
  }
}
