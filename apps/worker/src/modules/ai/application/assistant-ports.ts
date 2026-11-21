export type AssistantContextSnapshot = {
  djPreferences: string | null;
};

export type AssistantConversationTurn = { role: "user" | "assistant"; content: string };

export type CachedAssistantAnswer = {
  answer: string;
};

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
