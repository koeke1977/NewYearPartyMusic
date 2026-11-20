export type DjOverviewRequest = {
  id: string; spotify_track_id: string; track_uri: string; track_name: string;
  artist_name: string; album_image_url: string | null; duration_ms: number;
  status: string; moderation_reason: string | null; requested_at: string;
  queued_at: string | null; nickname: string; played_at?: string | null;
};
export type DjQueueTrack = { id: string; track_name: string; artist_name: string };

export interface DjQueueRepository {
  readActiveRequests(eventId: string): Promise<{ results?: DjOverviewRequest[] }>;
  readRecentPlayedRequests(eventId: string): Promise<{ results?: DjOverviewRequest[] }>;
  readOverviewSettings(): Promise<Record<string, string>>;
  readQueuedRequestIds(eventId: string): Promise<string[]>;
  readQueuedRequestTracks(eventId: string): Promise<DjQueueTrack[]>;
  saveQueueOrder(order: string[]): Promise<void>;
  readAiHistory(eventId: string): Promise<string | null>;
  saveAiHistory(eventId: string, history: Array<{ at: string; tracks: string[] }>): Promise<void>;
  saveSetting(key: string, enabled: boolean): Promise<void>;
}
