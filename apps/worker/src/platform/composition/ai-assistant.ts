import type { Env } from "../env";
import { sha256 } from "../security/crypto";
import { executeDJAssistant } from "../../modules/ai/application/execute-dj-assistant";
import type { AssistantRepository } from "../../modules/ai/application/assistant-ports";
import { loadAssistantContextSnapshot } from "../../modules/ai/infrastructure/assistant-context-repository";
import {
  claimAssistantRateLimit, readAssistantAnswerCache, rememberDJPreferenceInDatabase,
  writeAssistantAnswerCache,
} from "../../modules/ai/infrastructure/assistant-settings-repository";
import { createDailyAssistantNeuronBudget } from "../../modules/ai/application/neuron-budget-policy";
import { createD1AssistantNeuronUsageRepository } from "../../modules/ai/infrastructure/neuron-budget";

export function executeDJAssistantFromEnvironment(env: Env, prompt: string) {
  const repository: AssistantRepository = {
    rememberPreference: (eventId, value) => rememberDJPreferenceInDatabase(env.DB, eventId, value),
    loadContext: eventId => loadAssistantContextSnapshot(env.DB, eventId),
    readAnswerCache: key => readAssistantAnswerCache(env.DB, key),
    writeAnswerCache: (key, answer, matches) => writeAssistantAnswerCache(env.DB, key, answer, matches),
    claimRateLimit: () => claimAssistantRateLimit(env.DB),
    createNeuronBudget: () => createDailyAssistantNeuronBudget(createD1AssistantNeuronUsageRepository(env.DB)),
  };
  return executeDJAssistant({
    eventId: env.EVENT_ID, eventName: env.EVENT_NAME, ai: env.AI,
    prompt, repository, hash: sha256,
  });
}
