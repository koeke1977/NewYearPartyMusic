export const DAILY_ASSISTANT_NEURON_BUDGET = 7500;
export const ASSISTANT_NEURON_SAFETY_MULTIPLIER = 1.5;
export const ASSISTANT_INPUT_NEURONS_PER_MILLION_TOKENS = 9091;
export const ASSISTANT_OUTPUT_NEURONS_PER_MILLION_TOKENS = 27273;
export const ASSISTANT_MAX_OUTPUT_TOKENS = 1400;

export type D1SettingsDatabase = Pick<D1Database, "prepare">;

export type DailyAssistantNeuronBudget = {
  usageKey: string;
  currentEstimatedNeurons(): number;
  canAfford(inputCharacters: number, outputTokens: number): boolean;
  record(response: unknown, inputCharacters: number, maxOutputTokens: number): Promise<number>;
};

/** Conservative estimate retained from the existing PartyQueue free-tier guardrail. */
export function estimateAssistantNeurons(inputCharacters: number, outputTokens: number): number {
  return Math.ceil(
    (
      (Math.ceil(inputCharacters / 3) * ASSISTANT_INPUT_NEURONS_PER_MILLION_TOKENS) +
      (outputTokens * ASSISTANT_OUTPUT_NEURONS_PER_MILLION_TOKENS)
    ) / 1_000_000 * ASSISTANT_NEURON_SAFETY_MULTIPLIER,
  );
}

export function getAssistantNeuronUsageKey(now: Date = new Date()): string {
  return "dj_ai_neurons_" + now.toISOString().slice(0, 10);
}

function readProviderUsage(response: unknown): { promptTokens: number; completionTokens: number } {
  const root = response !== null && typeof response === "object"
    ? response as Record<string, unknown>
    : {};
  const result = root.result !== null && typeof root.result === "object"
    ? root.result as Record<string, unknown>
    : {};
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const firstChoice = choices[0] !== null && typeof choices[0] === "object"
    ? choices[0] as Record<string, unknown>
    : {};
  const choiceUsage = firstChoice.usage !== null && typeof firstChoice.usage === "object"
    ? firstChoice.usage as Record<string, unknown>
    : {};
  const usage = [root.usage, result.usage, choiceUsage].find(
    (candidate) => candidate !== null && typeof candidate === "object",
  ) as Record<string, unknown> | undefined;

  return {
    promptTokens: Math.max(0, Number(usage?.prompt_tokens) || 0),
    completionTokens: Math.max(0, Number(usage?.completion_tokens) || 0),
  };
}

/**
 * Loads the UTC-day estimate and returns a small stateful budget tracker.
 * Persistence remains in D1; no Cloudflare AI or Spotify dependency is introduced.
 */
export async function createDailyAssistantNeuronBudget(
  db: D1SettingsDatabase,
  now: Date = new Date(),
): Promise<DailyAssistantNeuronBudget> {
  const usageKey = getAssistantNeuronUsageKey(now);
  const row = await db.prepare("SELECT value FROM settings WHERE key=?")
    .bind(usageKey)
    .first<{ value: string }>();
  let estimatedDailyNeurons = Math.max(0, Number(row?.value || "0") || 0);

  return {
    usageKey,
    currentEstimatedNeurons: () => estimatedDailyNeurons,
    canAfford(inputCharacters, outputTokens) {
      return estimatedDailyNeurons + estimateAssistantNeurons(inputCharacters, outputTokens)
        <= DAILY_ASSISTANT_NEURON_BUDGET;
    },
    async record(response, inputCharacters, maxOutputTokens) {
      const usage = readProviderUsage(response);
      const promptTokens = usage.promptTokens || Math.ceil(inputCharacters / 3);
      const completionTokens = usage.completionTokens || maxOutputTokens;
      const estimate = estimateAssistantNeurons(promptTokens * 3, completionTokens);
      await db.prepare(
        "INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) " +
        "ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(settings.value AS REAL)+CAST(excluded.value AS REAL) AS TEXT),updated_at=CURRENT_TIMESTAMP",
      ).bind(usageKey, String(estimate)).run();
      estimatedDailyNeurons += estimate;
      return estimate;
    },
  };
}
