export type QueuedPartyQueueRequest = {
  id: string;
  track_uri: string;
  track_name: string;
  artist_name: string;
  duration_ms: number;
  queued_at: string;
  requested_at: string;
};

/** Persistence boundary for the atomic PartyQueue NEXT workflow. */
export interface QueueDispatchRepository {
  claimLock(owner: string): Promise<boolean>;
  listQueuedRequests(eventId: string): Promise<QueuedPartyQueueRequest[]>;
  readSavedOrder(): Promise<string[]>;
  markRequestPlayed(eventId: string, requestId: string): Promise<boolean>;
  markFallbackInactive(): Promise<void>;
  saveLastTrack(track: { uri: string; durationMs: number; startedAt: number }): Promise<void>;
  releaseLock(owner: string): Promise<void>;
}
