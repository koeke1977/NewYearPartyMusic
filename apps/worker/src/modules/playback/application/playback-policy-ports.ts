export type LastPartyQueueTrack = { uri: string; durationMs: number; startedAt: number };
export type PlaybackSetting = { value: string; updated_at?: string };

/** Application-owned persistence contract for queue advancement and Spotify fallback policy. */
export interface PlaybackPolicyRepository {
  readSetting(key: string): Promise<PlaybackSetting | null>;
  countQueuedRequests(eventId: string): Promise<number>;
  claimFallbackStart(): Promise<boolean>;
  setFallbackState(value: "true" | "false"): Promise<void>;
  setFallbackError(message: string): Promise<void>;
  setFallbackRetryAfter(timestamp: number): Promise<void>;
  clearFallbackFailure(): Promise<void>;
}
