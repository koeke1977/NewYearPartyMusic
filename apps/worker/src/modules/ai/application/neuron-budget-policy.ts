export const DAILY_ASSISTANT_NEURON_BUDGET = 7500;
export const ASSISTANT_NEURON_SAFETY_MULTIPLIER = 1.5;
export const ASSISTANT_INPUT_NEURONS_PER_MILLION_TOKENS = 9091;
export const ASSISTANT_OUTPUT_NEURONS_PER_MILLION_TOKENS = 27273;
export const ASSISTANT_MAX_OUTPUT_TOKENS = 1400;

export interface AssistantNeuronUsageRepository {
  readDailyUsage(usageKey: string): Promise<string | null>;
  addDailyUsage(usageKey: string, neurons: number): Promise<void>;
}

export type DailyAssistantNeuronBudget = {
  usageKey: string;
  currentEstimatedNeurons(): number;
  canAfford(inputCharacters: number, outputTokens: number): boolean;
  record(response: unknown, inputCharacters: number, maxOutputTokens: number): Promise<number>;
};

/** Conservative estimate retained from PartyQueue's existing free-tier guardrail. */
export function estimateAssistantNeurons(inputCharacters: number, outputTokens: number): number {
  return Math.ceil(((Math.ceil(inputCharacters / 3) * ASSISTANT_INPUT_NEURONS_PER_MILLION_TOKENS) + (outputTokens * ASSISTANT_OUTPUT_NEURONS_PER_MILLION_TOKENS)) / 1_000_000 * ASSISTANT_NEURON_SAFETY_MULTIPLIER);
}

export function getAssistantNeuronUsageKey(now: Date = new Date()): string {
  return "dj_ai_neurons_" + now.toISOString().slice(0, 10);
}

function readProviderUsage(response: unknown): { promptTokens: number; completionTokens: number } {
  const root = response !== null && typeof response === "object" ? response as Record<string, unknown> : {};
  const result = root.result !== null && typeof root.result === "object" ? root.result as Record<string, unknown> : {};
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const firstChoice = choices[0] !== null && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
  const choiceUsage = firstChoice.usage !== null && typeof firstChoice.usage === "object" ? firstChoice.usage as Record<string, unknown> : {};
  const usage = [root.usage, result.usage, choiceUsage].find(candidate => candidate !== null && typeof candidate === "object") as Record<string, unknown> | undefined;
  return { promptTokens: Math.max(0, Number(usage?.prompt_tokens) || 0), completionTokens: Math.max(0, Number(usage?.completion_tokens) || 0) };
}

export async function createDailyAssistantNeuronBudget(repository: AssistantNeuronUsageRepository, now: Date = new Date()): Promise<DailyAssistantNeuronBudget> {
  const usageKey = getAssistantNeuronUsageKey(now);
  let estimatedDailyNeurons = Math.max(0, Number(await repository.readDailyUsage(usageKey) || "0") || 0);
  return {
    usageKey,
    currentEstimatedNeurons: () => estimatedDailyNeurons,
    canAfford(inputCharacters, outputTokens) {
      return estimatedDailyNeurons + estimateAssistantNeurons(inputCharacters, outputTokens) <= DAILY_ASSISTANT_NEURON_BUDGET;
    },
    async record(response, inputCharacters, maxOutputTokens) {
      const usage = readProviderUsage(response);
      const promptTokens = usage.promptTokens || Math.ceil(inputCharacters / 3);
      const completionTokens = usage.completionTokens || maxOutputTokens;
      const estimate = estimateAssistantNeurons(promptTokens * 3, completionTokens);
      await repository.addDailyUsage(usageKey, estimate);
      estimatedDailyNeurons += estimate;
      return estimate;
    },
  };
}
