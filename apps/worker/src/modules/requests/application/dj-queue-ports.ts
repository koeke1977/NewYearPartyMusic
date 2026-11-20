import type { DjOverviewRequest, DjQueueTrack } from "../infrastructure/dj-queue-repository";

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
