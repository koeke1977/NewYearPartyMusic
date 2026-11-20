import { sha256 } from "../../../platform/security/crypto";
import type { Env } from "../../../platform/env";
import { runDJAssistantTurn } from "../orchestration/assistant-orchestrator";
import { buildEventMoment } from "../context/event-moment";
import {
  buildDJAssistantContext,
  parseAcceptedSetHistory,
  parseSavedQueueOrder,
} from "../context/assistant-context";
import { buildDJAssistantPrompt } from "../prompts/dj-assistant";
import { parseDJPreferences } from "../memory/dj-preferences";
import { loadAssistantContextSnapshot } from "../infrastructure/assistant-context-repository";
import {
  claimAssistantRateLimit,
  readAssistantAnswerCache,
  rememberDJPreferenceInDatabase,
  writeAssistantAnswerCache,
} from "../infrastructure/assistant-settings-repository";
import { createDailyAssistantNeuronBudget, ASSISTANT_MAX_OUTPUT_TOKENS } from "../infrastructure/neuron-budget";

export type DJAssistantHttpResult = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Executes the AI assistant use case. HTTP authentication, input parsing and
 * response serialization stay in the Hono adapter; context, budget, cache,
 * cooldown, provider orchestration and error policy live here.
 */
export async function executeDJAssistant(
  env: Env,
  prompt: string,
): Promise<DJAssistantHttpResult> {
  const memoryUpdated = await rememberDJPreferenceInDatabase(env.DB, env.EVENT_ID, prompt);
  const snapshot = await loadAssistantContextSnapshot(env.DB, env.EVENT_ID);
  const context = buildDJAssistantContext({
    event: env.EVENT_NAME,
    eventMoment: buildEventMoment(),
    djPreferences: parseDJPreferences(snapshot.djPreferences),
    acceptedSetHistory: parseAcceptedSetHistory(snapshot.acceptedSetHistory),
    tracks: snapshot.queue,
    playedTracks: snapshot.playedTracks,
    requestCounts: snapshot.requestCounts,
    savedQueueOrder: parseSavedQueueOrder(snapshot.savedQueueOrder),
  });
  const { system, user } = buildDJAssistantPrompt(context, prompt);
  const provider = "cloudflare";
  const cacheKey = await sha256(provider + "\n" + system + "\n" + user + "\nspotify-tools-v1");
  const cached = await readAssistantAnswerCache(env.DB, cacheKey);
  if (cached) {
    return {
      status: 200,
      body: { ok: true, provider, answer: cached.answer, spotifyMatches: cached.spotifyMatches, cached: true, memoryUpdated },
    };
  }

  // Keep the free Workers AI usage below 10,000 daily Neurons, reserving 2,500 for other usage.
  const neuronBudget = await createDailyAssistantNeuronBudget(env.DB);
  if (!neuronBudget.canAfford(system.length + user.length, ASSISTANT_MAX_OUTPUT_TOKENS)) {
    return {
      status: 429,
      body: { error: "DJ#DATUUR AI heeft zijn veilige dagbudget bereikt. Er worden geen extra AI-aanroepen gedaan; morgen vanaf 00:00 UTC is er opnieuw gratis budget." },
    };
  }
  if (!await claimAssistantRateLimit(env.DB)) {
    return { status: 429, body: { error: "Geef DJ#DATUUR AI even een paar seconden." } };
  }

  try {
    if (!env.AI) {
      return {
        status: 503,
        body: { error: "Cloudflare Workers AI-binding ontbreekt. Voeg [ai] binding = \"AI\" toe en deploy opnieuw." },
      };
    }
    const model = "@cf/google/gemma-4-26b-a4b-it";
    const { answer, spotifyMatches } = await runDJAssistantTurn(
      env.AI, env, model, system, user, neuronBudget,
    );
    await writeAssistantAnswerCache(env.DB, cacheKey, answer, spotifyMatches);
    return {
      status: 200,
      body: { ok: true, provider, answer, spotifyMatches, cached: false, memoryUpdated },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "AI-assistent is tijdelijk niet beschikbaar.";
    const freeQuotaReached = /neuron|daily.{0,30}(limit|quota)|quota|limit.{0,30}(reached|exceeded)|exceeded.{0,30}(limit|quota)|HTTP 429|rate limit/i.test(errorMessage);
    return {
      status: freeQuotaReached ? 429 : 502,
      body: {
        error: freeQuotaReached
          ? "Het gratis Cloudflare AI-dagbudget lijkt bereikt. DJ#DATUUR AI probeert geen betalende provider; probeer opnieuw na de dagelijkse reset om 00:00 UTC."
          : errorMessage,
      },
    };
  }
}
