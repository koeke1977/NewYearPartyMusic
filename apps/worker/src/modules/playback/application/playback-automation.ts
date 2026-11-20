import type { LastPartyQueueTrack, PlaybackPolicyRepository } from "./playback-policy-ports";

export type AdvanceResult = { advanced: boolean; error?: string };
export type DispatchResult = { ok: boolean; busy?: boolean; error?: string };

type SharedPlaybackPolicyDependencies = {
  repository: PlaybackPolicyRepository;
  eventId: string;
  now?: () => number;
};

type QueueAdvanceDependencies = SharedPlaybackPolicyDependencies & { dispatchNext: () => Promise<DispatchResult> };
type SpotifyFallbackDependencies = SharedPlaybackPolicyDependencies & { startFallback: () => Promise<void> };

function parseLastTrack(raw: string | undefined): LastPartyQueueTrack | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const track = value as Partial<LastPartyQueueTrack>;
    if (typeof track.uri !== "string" || !track.uri || typeof track.durationMs !== "number" || !Number.isFinite(track.durationMs) || track.durationMs <= 0 || typeof track.startedAt !== "number" || !Number.isFinite(track.startedAt) || track.startedAt <= 0) return null;
    return track as LastPartyQueueTrack;
  } catch { return null; }
}

export async function maybeAdvancePartyQueue({ repository, eventId, dispatchNext, now = () => Date.now() }: QueueAdvanceDependencies, playing: boolean): Promise<AdvanceResult> {
  if (playing) return { advanced: false };
  if ((await repository.readSetting("spotify_manual_pause"))?.value === "true") return { advanced: false };
  const last = parseLastTrack((await repository.readSetting("spotify_last_partyqueue_track"))?.value);
  if (!last || now() - last.startedAt < Math.max(0, last.durationMs - 2500)) return { advanced: false };
  if (!(await repository.countQueuedRequests(eventId))) return { advanced: false };
  const result = await dispatchNext();
  if (result.ok) return { advanced: true };
  if (result.busy) return { advanced: false };
  return { advanced: false, error: result.error };
}

export async function maybeStartSpotifyFallback({ repository, eventId, startFallback, now = () => Date.now() }: SpotifyFallbackDependencies, currentTrackUri: string | null, playing: boolean): Promise<boolean> {
  if ((await repository.readSetting("spotify_manual_pause"))?.value === "true") return false;
  const state = await repository.readSetting("spotify_fallback_active");
  if (state?.value === "true") return true;
  if (state?.value === "starting" && now() - Date.parse((state.updated_at || "") + "Z") < 60000) return false;
  if (Number((await repository.readSetting("spotify_fallback_retry_after"))?.value || 0) > now()) return false;
  if ((await repository.countQueuedRequests(eventId)) > 0) return false;
  const last = parseLastTrack((await repository.readSetting("spotify_last_partyqueue_track"))?.value);
  if (!last) return false;
  if (now() - last.startedAt < Math.max(0, last.durationMs - 4000)) return false;
  if (currentTrackUri === last.uri && playing) return false;
  if (!(await repository.claimFallbackStart())) return false;
  try {
    await startFallback();
    await repository.clearFallbackFailure();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Spotify-fout";
    await repository.setFallbackError(message);
    await repository.setFallbackState("false");
    await repository.setFallbackRetryAfter(now() + 60000);
    return false;
  }
}
