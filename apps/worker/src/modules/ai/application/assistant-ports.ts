import type {
  AssistantPlayedTrack,
  AssistantQueueTrack,
  AssistantRequestCount,
} from "../context/assistant-context";

export type AssistantContextSnapshot = {
  queue: AssistantQueueTrack[];
  playedTracks: AssistantPlayedTrack[];
  requestCounts: AssistantRequestCount[];
  savedQueueOrder: string | null;
  djPreferences: string | null;
  acceptedSetHistory: string | null;
};

export type CachedSpotifyMatch = {
  query: string;
  tracks: Array<Record<string, unknown>>;
};

export type CachedAssistantAnswer = {
  answer: string;
  spotifyMatches: CachedSpotifyMatch[];
};

export interface AssistantNeuronBudget {
  canAfford(inputCharacters: number, outputTokens: number): boolean;
  record(response: unknown, inputCharacters: number, maxOutputTokens: number): Promise<number>;
}

export interface AssistantRepository {
  rememberPreference(eventId: string, prompt: string): Promise<boolean>;
  loadContext(eventId: string): Promise<AssistantContextSnapshot>;
  readAnswerCache(cacheKey: string): Promise<CachedAssistantAnswer | null>;
  writeAnswerCache(cacheKey: string, answer: string, matches: CachedSpotifyMatch[]): Promise<void>;
  claimRateLimit(): Promise<boolean>;
  createNeuronBudget(): Promise<AssistantNeuronBudget>;
}
