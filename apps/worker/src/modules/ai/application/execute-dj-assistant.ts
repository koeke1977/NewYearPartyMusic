import type { CloudflareAIClient, AssistantRepository, LocalAIAssistantClient } from "./assistant-ports";

import { runDJAssistantTurn } from "../orchestration/assistant-orchestrator";
import { buildEventMoment } from "../context/event-moment";
import { buildDJAssistantContext } from "../context/assistant-context";
import { buildDJAssistantPrompt } from "../prompts/dj-assistant";
import { parseDJPreferences } from "../memory/dj-preferences";
import { ASSISTANT_MAX_OUTPUT_TOKENS } from "./neuron-budget-policy";

export type DJAssistantHttpResult = { status: number; body: Record<string, unknown> };

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/** Executes a Spotify-independent AI turn using event timing, DJ preferences and bounded DJ/AI conversation history. */
export async function executeDJAssistant(input: {
  eventId: string;
  eventName: string;
  sessionId: string;
  ai?: CloudflareAIClient;
  localAI?: LocalAIAssistantClient;
  prompt: string;
  repository: AssistantRepository;
  hash(value: string): Promise<string>;
}): Promise<DJAssistantHttpResult> {
  const { eventId, eventName, ai, prompt, repository } = input;
  const memoryUpdated = await repository.rememberPreference(eventId, prompt);
  const snapshot = await repository.loadContext(eventId);
  const conversation = await repository.loadConversation(eventId, input.sessionId);
  const context = buildDJAssistantContext({
    event: eventName,
    eventMoment: buildEventMoment(),
    djPreferences: parseDJPreferences(snapshot.djPreferences),
    partyQueue: snapshot.partyQueue,
  });
  const { system, user } = buildDJAssistantPrompt(context, prompt, conversation);
  const persistTurn = async (answer: string): Promise<boolean> => {
    try {
      await repository.saveConversation(eventId, input.sessionId, prompt, answer);
      return true;
    } catch (error) {
      console.error("DJ AI conversation persistence failed", error instanceof Error ? error.message : "unknown error");
      return false;
    }
  };
  const provider = input.localAI ? "claude-code-local" : "cloudflare";
  const cacheKey = await input.hash(provider + "\n" + system + "\n" + user + "\nlive-party-context-v5");
  const cached = await repository.readAnswerCache(cacheKey);
  if (cached) {
    const conversationSaved = await persistTurn(cached.answer);
    return { status: 200, body: { ok: true, provider, answer: cached.answer, spotifyMatches: [], cached: true, memoryUpdated, sessionId: input.sessionId, conversationSaved } };
  }

  if (input.localAI) {
    if (!await repository.claimRateLimit()) {
      return { status: 429, body: { error: "Geef DJ#DATUUR AI even een paar seconden." } };
    }
    try {
      const answer = await withTimeout(
        input.localAI.complete(system, user),
        95000,
        "De lokale AI heeft niet tijdig geantwoord. Controleer of Claude Code en de lokale bridge actief zijn.",
      );
      const conversationSaved = await persistTurn(answer);
      await repository.writeAnswerCache(cacheKey, answer);
      return { status: 200, body: { ok: true, provider: "claude-code-local", answer, spotifyMatches: [], cached: false, memoryUpdated, sessionId: input.sessionId, conversationSaved } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Lokale Claude-assistent is tijdelijk niet beschikbaar.";
      const usageLimitReached = /usage limit|rate limit|limit reached|hit your limit|weekly limit|five-hour limit|capacity|429/i.test(errorMessage);
      return {
        status: usageLimitReached ? 429 : 502,
        body: { error: usageLimitReached
          ? "Claude heeft zijn abonnementslimiet bereikt. Er wordt niet overgeschakeld naar betaalde API-kosten; probeer later opnieuw."
          : "De lokale AI-bridge is niet bereikbaar of Claude Code is niet beschikbaar: " + errorMessage },
      };
    }
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
    const { answer } = await withTimeout(
      runDJAssistantTurn(ai, model, system, user, neuronBudget),
      90000,
      "Cloudflare AI antwoordde niet binnen 90 seconden. Probeer het opnieuw.",
    );
    const conversationSaved = await persistTurn(answer);
    await repository.writeAnswerCache(cacheKey, answer);
    return { status: 200, body: { ok: true, provider, answer, spotifyMatches: [], cached: false, memoryUpdated, sessionId: input.sessionId, conversationSaved } };
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
