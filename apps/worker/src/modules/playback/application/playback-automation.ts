import type { PlaybackPolicyDatabase, LastPartyQueueTrack } from "../infrastructure/playback-policy-repository";
import {
  claimSpotifyFallbackStart,
  clearSpotifyFallbackFailure,
  readPlaybackSetting,
  readQueuedRequestCount,
  setSpotifyFallbackError,
  setSpotifyFallbackRetryAfter,
  setSpotifyFallbackState,
} from "../infrastructure/playback-policy-repository";

export type AdvanceResult = { advanced: boolean; error?: string };
export type DispatchResult = { ok: boolean; busy?: boolean; error?: string };

type PlaybackPolicyBase = {
  db: PlaybackPolicyDatabase;
  eventId: string;
  now?: () => number;
};

type QueueAdvancementDependencies = PlaybackPolicyBase & {
  dispatchNext: () => Promise<DispatchResult>;
};

type SpotifyFallbackDependencies = PlaybackPolicyBase & {
  startFallback: () => Promise<void>;
};

function parseLastTrack(raw: string | undefined): LastPartyQueueTrack | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const track = value as Partial<LastPartyQueueTrack>;
    if (typeof track.uri !== "string" || !track.uri ||
        typeof track.durationMs !== "number" || !Number.isFinite(track.durationMs) || track.durationMs <= 0 ||
        typeof track.startedAt !== "number" || !Number.isFinite(track.startedAt) || track.startedAt <= 0) return null;
    return track as LastPartyQueueTrack;
  } catch {
    return null;
  }
}

export async function maybeAdvancePartyQueue({
  db, eventId, dispatchNext, now = () => Date.now(),
}: QueueAdvancementDependencies, playing: boolean): Promise<AdvanceResult> {
  if (playing) return { advanced: false };
  const manualPause = await readPlaybackSetting(db, "spotify_manual_pause");
  if (manualPause?.value === "true") return { advanced: false };
  const lastState = await readPlaybackSetting(db, "spotify_last_partyqueue_track");
  const last = parseLastTrack(lastState?.value);
  if (!last) return { advanced: false };
  // Preserve the existing 2.5-second Spotify end-of-track tolerance.
  if (now() - last.startedAt < Math.max(0, last.durationMs - 2500)) return { advanced: false };
  if (!(await readQueuedRequestCount(db, eventId))) return { advanced: false };
  const result = await dispatchNext();
  if (result.ok) return { advanced: true };
  // A simultaneous manual/automatic NEXT is expected contention, not an autoplay failure.
  if (result.busy) return { advanced: false };
  return { advanced: false, error: result.error };
}

export async function maybeStartSpotifyFallback({
  db, eventId, startFallback, now = () => Date.now(),
}: SpotifyFallbackDependencies, currentTrackUri: string | null, playing: boolean): Promise<boolean> {
  const manualPause = await readPlaybackSetting(db, "spotify_manual_pause");
  if (manualPause?.value === "true") return false;

  const state = await readPlaybackSetting(db, "spotify_fallback_active");
  if (state?.value === "true") return true;
  if (state?.value === "starting" && now() - Date.parse((state.updated_at || "") + "Z") < 60000) return false;

  const retry = await readPlaybackSetting(db, "spotify_fallback_retry_after");
  if (Number(retry?.value || 0) > now()) return false;
  if ((await readQueuedRequestCount(db, eventId)) > 0) return false;

  const lastState = await readPlaybackSetting(db, "spotify_last_partyqueue_track");
  const last = parseLastTrack(lastState?.value);
  if (!last) return false;

  const elapsed = now() - last.startedAt;
  // Preserve the existing 4-second fallback tolerance and stale-track Spotify behaviour.
  if (elapsed < Math.max(0, last.durationMs - 4000)) return false;
  if (currentTrackUri === last.uri && playing) return false;

  if (!(await claimSpotifyFallbackStart(db))) return false;
  try {
    await startFallback();
    await clearSpotifyFallbackFailure(db);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Spotify-fout";
    await setSpotifyFallbackError(db, message);
    await setSpotifyFallbackState(db, "false");
    await setSpotifyFallbackRetryAfter(db, now() + 60000);
    return false;
  }
}
