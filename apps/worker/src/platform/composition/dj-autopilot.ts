import type { Env } from "../env";
import { runDJAutopilot } from "../../modules/ai/application/dj-autopilot";
import { executeDJAssistantActions } from "../../modules/ai/application/execute-dj-assistant-actions";
import { createDailyAssistantNeuronBudget } from "../../modules/ai/application/neuron-budget-policy";
import { createDJAutopilotRepository } from "../../modules/ai/infrastructure/dj-autopilot-d1-repository";
import { createD1AssistantNeuronUsageRepository } from "../../modules/ai/infrastructure/neuron-budget";
import { createGuestRequestRepository } from "../../modules/requests/infrastructure/guest-request-d1-repository";
import { createDjQueueRepository } from "../../modules/requests/infrastructure/dj-queue-d1-repository";
import { addDjTrackToPartyQueue, moderatePartyRequest } from "../../modules/requests/application/guest-request-lifecycle";
import { getSpotifyCatalogTrack, searchSpotifyCatalog } from "../../integrations/spotify/catalog-api";
import type { AssistantContextSnapshot } from "../../modules/ai/application/assistant-ports";

function normalizeTrack(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function trackWasRecentlyQueuedOrPlayed(
  track: { name: string; artists: string[] },
  snapshot: AssistantContextSnapshot,
): boolean {
  const candidates = [...snapshot.partyQueue.queued, ...snapshot.partyQueue.recentlyPlayed]
    .map(item => item.track);
  const candidateKeys = new Set(candidates.map(normalizeTrack));
  return track.artists.some(artist => candidateKeys.has(normalizeTrack(track.name + " — " + artist)));
}

/** Runs one opt-in, budget-guarded Autopilot tick using the same Spotify and PartyQueue use cases as the DJ console. */
export function runDJAutopilotFromEnvironment(env: Env) {
  const repository = createDJAutopilotRepository(env.DB);
  const guestRequestRepository = createGuestRequestRepository(env.DB);
  const djQueueRepository = createDjQueueRepository(env.DB);
  return runDJAutopilot({
    eventId: env.EVENT_ID,
    eventName: env.EVENT_NAME,
    ai: env.AI,
    repository,
    createNeuronBudget: () => createDailyAssistantNeuronBudget(createD1AssistantNeuronUsageRepository(env.DB)),
    executor: {
      execute: (prompt, actions, canContinue, snapshot) => executeDJAssistantActions({
        prompt,
        actions,
        ports: {
          searchTracks: async query => {
            const result = await searchSpotifyCatalog(env, query, 3);
            if (result.kind !== "available") throw new Error("Spotify catalogus tijdelijk niet beschikbaar.");
            return result.tracks;
          },
          addTrack: trackId => addDjTrackToPartyQueue({
            repository: guestRequestRepository,
            eventId: env.EVENT_ID,
            trackId,
            createId: () => crypto.randomUUID(),
            trackGateway: { getTrack: id => getSpotifyCatalogTrack(env, id) },
          }),
          canContinue: async () => await canContinue()
            && (await djQueueRepository.readQueuedRequestIds(env.EVENT_ID)).length < 8,
          isTrackAllowed: track => !trackWasRecentlyQueuedOrPlayed(track, snapshot),
        },
      }),
    },
  });
}
