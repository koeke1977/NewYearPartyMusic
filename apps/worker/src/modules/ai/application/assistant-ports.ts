export type PartyQueueContext = {
  activity: {
    totalRequests: number;
    uniqueTracksRequested: number;
    pending: number;
    approved: number;
    queued: number;
    played: number;
    rejected: number;
    failed: number;
    topArtists: Array<{ artist: string; requests: number }>;
  };
  queued: Array<{ track: string; durationMs: number | null }>;
  recentlyPlayed: Array<{ track: string; playedAt: string | null }>;
  audience: {
    respondents: number;
    genres: Array<{ label: string; guests: number; share: number }>;
    subgenres: Array<{ label: string; guests: number; share: number }>;
    decades: Array<{ label: string; guests: number; share: number }>;
    moods: Array<{ label: string; guests: number; share: number }>;
    averageEnergy: number | null;
  };
  crowdFeedback: {
    eligible: boolean;
    respondents: number;
    windowMinutes: number;
    atmosphere: { good: number; neutral: number; bad: number } | null;
    averageEnergy: number | null;
    trend: "insufficient" | "negative" | "positive" | "mixed";
  };
};
export type AssistantContextSnapshot = { djPreferences: string | null; partyQueue: PartyQueueContext };
export type AssistantConversationTurn = { role: "user" | "assistant"; content: string };
export type CachedAssistantAnswer = { answer: string };
export interface AssistantNeuronBudget {
  canAfford(inputCharacters: number, outputTokens: number): boolean;
  record(response: unknown, inputCharacters: number, maxOutputTokens: number): Promise<number>;
}
export interface AssistantRepository {
  rememberPreference(eventId: string, prompt: string): Promise<boolean>;
  loadContext(eventId: string): Promise<AssistantContextSnapshot>;
  loadConversation(eventId: string, sessionId: string): Promise<AssistantConversationTurn[]>;
  saveConversation(eventId: string, sessionId: string, prompt: string, answer: string): Promise<void>;
  readAnswerCache(cacheKey: string): Promise<CachedAssistantAnswer | null>;
  writeAnswerCache(cacheKey: string, answer: string): Promise<void>;
  claimRateLimit(): Promise<boolean>;
  createNeuronBudget(): Promise<AssistantNeuronBudget>;
}
export type CloudflareAIClient = { run(model: string, input: Record<string, unknown>): Promise<unknown> };
export type LocalAIAssistantClient = { complete(system: string, user: string): Promise<string> };
