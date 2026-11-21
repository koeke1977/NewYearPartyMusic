import type { Env } from "../env";
import { sha256 } from "../security/crypto";
import { executeDJAssistant } from "../../modules/ai/application/execute-dj-assistant";
import { executeDJAssistantActions } from "../../modules/ai/application/execute-dj-assistant-actions";
import { createDjQueueRepository } from "../../modules/requests/infrastructure/dj-queue-d1-repository";
import { createGuestRequestRepository } from "../../modules/requests/infrastructure/guest-request-d1-repository";
import { addDjTrackToPartyQueue, moderatePartyRequest } from "../../modules/requests/application/guest-request-lifecycle";
import { reorderDjQueue } from "../../modules/requests/application/dj-queue-management";
import { getSpotifyCatalogTrack, searchSpotifyCatalog } from "../../integrations/spotify/catalog-api";
import type { AssistantRepository } from "../../modules/ai/application/assistant-ports";
import { loadAssistantContextSnapshot } from "../../modules/ai/infrastructure/assistant-context-repository";
import {
  claimAssistantRateLimit, readAssistantAnswerCache, rememberDJPreferenceInDatabase,
  writeAssistantAnswerCache,
} from "../../modules/ai/infrastructure/assistant-settings-repository";
import { createDailyAssistantNeuronBudget } from "../../modules/ai/application/neuron-budget-policy";
import { createD1AssistantNeuronUsageRepository } from "../../modules/ai/infrastructure/neuron-budget";
import { createLocalAIBridgeClient } from "../../integrations/ai/local-ai-bridge";
import { loadAssistantConversation, saveAssistantConversationTurn } from "../../modules/ai/infrastructure/assistant-conversation-repository";

export function executeDJAssistantFromEnvironment(env: Env, prompt: string, sessionId: string) {
  const guestRequestRepository = createGuestRequestRepository(env.DB);
  const djQueueRepository = createDjQueueRepository(env.DB);
  const repository: AssistantRepository = {
    rememberPreference: (eventId, value) => rememberDJPreferenceInDatabase(env.DB, eventId, value),
    loadContext: eventId => loadAssistantContextSnapshot(env.DB, eventId),
    loadConversation: (eventId, sessionId) => loadAssistantConversation(env.DB, eventId, sessionId),
    saveConversation: (eventId, sessionId, prompt, answer) =>
      saveAssistantConversationTurn(env.DB, eventId, sessionId, prompt, answer),
    readAnswerCache: key => readAssistantAnswerCache(env.DB, key),
    writeAnswerCache: (key, answer) => writeAssistantAnswerCache(env.DB, key, answer),
    claimRateLimit: () => claimAssistantRateLimit(env.DB),
    createNeuronBudget: () => createDailyAssistantNeuronBudget(createD1AssistantNeuronUsageRepository(env.DB)),
  };
  return executeDJAssistant({
    eventId: env.EVENT_ID, eventName: env.EVENT_NAME, ai: env.AI,
    localAI: createLocalAIBridgeClient({ url: env.LOCAL_AI_BRIDGE_URL, token: env.LOCAL_AI_BRIDGE_TOKEN,
      accessClientId: env.LOCAL_AI_ACCESS_CLIENT_ID, accessClientSecret: env.LOCAL_AI_ACCESS_CLIENT_SECRET }),
    prompt, sessionId, repository, hash: sha256,
    actionExecutor: {
      execute: actions => executeDJAssistantActions({
        prompt,
        actions,
        ports: {
          searchTracks: async query => {
            const result = await searchSpotifyCatalog(env, query, 3);
            if (result.kind !== "available") throw new Error("Spotify catalogus tijdelijk niet beschikbaar.");
            return result.tracks;
          },
          addTrack: trackId => addDjTrackToPartyQueue({
            repository: guestRequestRepository, eventId: env.EVENT_ID, trackId,
            createId: () => crypto.randomUUID(),
            trackGateway: { getTrack: id => getSpotifyCatalogTrack(env, id) },
          }),
          readQueueIds: () => djQueueRepository.readQueuedRequestIds(env.EVENT_ID),
          removeQueuedTrack: requestId => moderatePartyRequest({
            repository: guestRequestRepository, eventId: env.EVENT_ID, requestId, action: "reject",
          }),
          reorderQueue: order => reorderDjQueue({
            repository: djQueueRepository, eventId: env.EVENT_ID, order,
          }),
        },
      }),
    },
  });
}
