import type { CloudflareAIClient, AssistantRepository } from "./assistant-ports";

import { runDJAssistantTurn } from "../orchestration/assistant-orchestrator";
import { buildEventMoment } from "../context/event-moment";
import { buildDJAssistantContext } from "../context/assistant-context";
import { buildDJAssistantPrompt } from "../prompts/dj-assistant";
import { parseDJPreferences } from "../memory/dj-preferences";
import { ASSISTANT_MAX_OUTPUT_TOKENS } from "./neuron-budget-policy";

export type DJAssistantHttpResult = { status: number; body: Record<string, unknown> };

/** Executes a Spotify-content-free AI turn through application-owned persistence and budget ports. */
export async function executeDJAssistant(input: {
  eventId: string;
  eventName: string;
  ai?: CloudflareAIClient;
  prompt: string;
  repository: AssistantRepository;
  hash(value: string): Promise<string>;
}): Promise<DJAssistantHttpResult> {
  const { eventId, eventName, ai, prompt, repository } = input;
  const memoryUpdated = await repository.rememberPreference(eventId, prompt);
  const snapshot = await repository.loadContext(eventId);
  const context = buildDJAssistantContext({
    event: eventName,
    eventMoment: buildEventMoment(),
    djPreferences: parseDJPreferences(snapshot.djPreferences),
    requestCounts: snapshot.requestCounts,
  });
  const { system, user } = buildDJAssistantPrompt(context, prompt);
  const provider = "cloudflare";
  // New cache namespace prevents reuse of answers generated with Spotify content.
  const cacheKey = await input.hash(provider + "\n" + system + "\n" + user + "\nspotify-content-free-v2");
  const cached = await repository.readAnswerCache(cacheKey);
  if (cached) {
    return { status: 200, body: { ok: true, provider, answer: cached.answer, spotifyMatches: [], cached: true, memoryUpdated } };
  }

  const neuronBudget = await repository.createNeuronBudget();
  if (!neuronBudget.canAfford(system.length + user.length, ASSISTANT_MAX_OUTPUT_TOKENS)) {
    return { status: 429, body: { error: "DJ#DATUUR AI heeft zijn veilige dagbudget bereikt. Er worden geen extra AI-aanroepen gedaan; morgen vanaf 00:00 UTC is er opnieuw gratis budget." } };
  }
  if (!await repository.claimRateLimit()) {
    return { status: 429, body: { error: "Geef DJ#DATUUR AI even een paar seconden." } };
  }

  try {
    if (!ai) {
      return { status: 503, body: { error: "Cloudflare Workers AI-binding ontbreekt. Voeg [ai] binding = \"AI\" toe en deploy opnieuw." } };
    }
    const model = "@cf/google/gemma-4-26b-a4b-it";
    const { answer } = await runDJAssistantTurn(ai, model, system, user, neuronBudget);
    await repository.writeAnswerCache(cacheKey, answer, []);
    return { status: 200, body: { ok: true, provider, answer, spotifyMatches: [], cached: false, memoryUpdated } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "AI-assistent is tijdelijk niet beschikbaar.";
    const freeQuotaReached = /neuron|daily.{0,30}(limit|quota)|quota|limit.{0,30}(reached|exceeded)|exceeded.{0,30}(limit|quota)|HTTP 429|rate limit/i.test(errorMessage);
    return {
      status: freeQuotaReached ? 429 : 502,
      body: { error: freeQuotaReached
        ? "Het gratis Cloudflare AI-dagbudget lijkt bereikt. DJ#DATUUR AI probeert geen betalende provider; probeer opnieuw na de dagelijkse reset om 00:00 UTC."
        : errorMessage },
    };
  }
}
