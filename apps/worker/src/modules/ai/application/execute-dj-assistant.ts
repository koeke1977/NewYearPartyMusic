import type { CloudflareAIClient, AssistantRepository, LocalAIAssistantClient } from "./assistant-ports";
import type { DJAssistantActionResult } from "./execute-dj-assistant-actions";

import { runDJAssistantTurn } from "../orchestration/assistant-orchestrator";
import { buildEventMoment } from "../context/event-moment";
import { buildDJAssistantContext } from "../context/assistant-context";
import { buildDJAssistantPrompt } from "../prompts/dj-assistant";
import { parseDJPreferences } from "../memory/dj-preferences";
import { detectDJActionIntent, parseDJAssistantActionEnvelope } from "./execute-dj-assistant-actions";
import { ASSISTANT_MAX_OUTPUT_TOKENS } from "./neuron-budget-policy";

export type DJAssistantHttpResult = { status: number; body: Record<string, unknown> };
export type DJAssistantActionExecutor = {
  execute(actions: unknown[]): Promise<DJAssistantActionResult[]>;
};

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

function actionSummary(results: DJAssistantActionResult[]): string {
  return results.map(result => {
    const label = result.type === "add_tracks" ? "Tracks toevoegen"
      : result.type === "remove_tracks" ? "Tracks verwijderen" : "PartyQueue herschikken";
    const counts = result.type === "add_tracks"
      ? result.succeeded + " toegevoegd, " + (result.alreadyPresent || 0) + " stonden al in de wachtrij, " + result.failed + " mislukt"
      : result.type === "remove_tracks"
        ? result.succeeded + " verwijderd, " + result.failed + " mislukt"
        : result.succeeded ? "volgorde bijgewerkt" : "niet gewijzigd";
    return label + ": " + counts + (result.details.length ? "\n" + result.details.join("\n") : "");
  }).join("\n\n");
}

/** Executes a bounded AI turn and, only for explicit DJ commands, validated PartyQueue actions. */
export async function executeDJAssistant(input: {
  eventId: string;
  eventName: string;
  sessionId: string;
  ai?: CloudflareAIClient;
  localAI?: LocalAIAssistantClient;
  prompt: string;
  repository: AssistantRepository;
  hash(value: string): Promise<string>;
  actionExecutor?: DJAssistantActionExecutor;
}): Promise<DJAssistantHttpResult> {
  const { eventId, eventName, ai, prompt, repository } = input;
  const intent = detectDJActionIntent(prompt);
  const actionMode = intent.add || intent.remove || intent.reorder;
  const memoryUpdated = await repository.rememberPreference(eventId, prompt);
  const snapshot = await repository.loadContext(eventId);
  const conversation = await repository.loadConversation(eventId, input.sessionId);
  const context = buildDJAssistantContext({
    event: eventName,
    eventMoment: buildEventMoment(),
    djPreferences: parseDJPreferences(snapshot.djPreferences),
    partyQueue: snapshot.partyQueue,
  });
  const { system, user } = buildDJAssistantPrompt(context, prompt, conversation, actionMode);
  const persistTurn = async (answer: string): Promise<boolean> => {
    try {
      await repository.saveConversation(eventId, input.sessionId, prompt, answer);
      return true;
    } catch (error) {
      console.error("DJ AI conversation persistence failed", error instanceof Error ? error.message : "unknown error");
      return false;
    }
  };
  const finishAnswer = async (raw: string): Promise<{ answer: string; actions: DJAssistantActionResult[] }> => {
    if (!actionMode) return { answer: raw, actions: [] };
    if (!input.actionExecutor) {
      return { answer: "Er is niets gewijzigd: de actie-uitvoerder is niet beschikbaar.", actions: [] };
    }
    if (intent.remove) {
      const plan = parseDJAssistantActionEnvelope(raw);
      const answer = plan?.answer || "Ik controleer de volledige actuele PartyQueue op de gevraagde artiest of track.";
      const actions = await input.actionExecutor.execute([{ type: "remove_tracks", requestIds: [] }]);
      if (!actions.length) {
        return { answer: answer + "\n\nEr is niets gewijzigd; de verwijdering kon niet veilig worden bevestigd.", actions: [] };
      }
      return { answer: answer + "\n\nUitvoering in PartyQueue:\n" + actionSummary(actions), actions };
    }
    const plan = parseDJAssistantActionEnvelope(raw);
    if (!plan) {
      return { answer: "Ik kon geen geldig, veilig actieplan verwerken. Er is niets gewijzigd.", actions: [] };
    }
    if (!plan.actions.length) return { answer: plan.answer + "\n\nEr is niets gewijzigd; er werd geen veilige actie gevonden.", actions: [] };
    const actions = await input.actionExecutor.execute(plan.actions);
    if (!actions.length) {
      return { answer: plan.answer + "\n\nEr is niets gewijzigd; de gevraagde actie kon niet veilig worden bevestigd.", actions: [] };
    }
    return { answer: plan.answer + "\n\nUitvoering in PartyQueue:\n" + actionSummary(actions), actions };
  };
  const completeResponse = async (raw: string, provider: string, cached: boolean) => {
    const completed = await finishAnswer(raw);
    const conversationSaved = await persistTurn(completed.answer);
    if (!actionMode && !cached) await repository.writeAnswerCache(cacheKey, raw);
    return {
      status: 200,
      body: {
        ok: true, provider, answer: completed.answer, spotifyMatches: [], cached,
        memoryUpdated, sessionId: input.sessionId, conversationSaved,
        ...(completed.actions.length ? { actionResults: completed.actions } : {}),
      },
    } as DJAssistantHttpResult;
  };

  const provider = input.localAI ? "claude-code-local" : "cloudflare";
  const cacheKey = await input.hash(provider + "\n" + system + "\n" + user + "\nlive-party-context-v6");
  if (intent.remove) {
    return await completeResponse(JSON.stringify({
      answer: "Ik controleer de volledige actuele PartyQueue op de gevraagde artiest of track.",
      actions: [],
    }), provider, false);
  }
  if (!actionMode) {
    const cached = await repository.readAnswerCache(cacheKey);
    if (cached) {
      const conversationSaved = await persistTurn(cached.answer);
      return { status: 200, body: { ok: true, provider, answer: cached.answer, spotifyMatches: [], cached: true, memoryUpdated, sessionId: input.sessionId, conversationSaved } };
    }
  }

  if (input.localAI) {
    if (!await repository.claimRateLimit()) {
      return { status: 429, body: { error: "Geef DJ#DATUUR AI even een paar seconden." } };
    }
    try {
      const raw = await withTimeout(
        input.localAI.complete(system, user),
        95000,
        "De lokale AI heeft niet tijdig geantwoord. Controleer of Claude Code en de lokale bridge actief zijn.",
      );
      return await completeResponse(raw, "claude-code-local", false);
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
      return { status: 503, body: { error: "Cloudflare Workers AI-binding ontbreekt. Voeg de AI-binding toe aan wrangler.toml en deploy opnieuw." } };
    }
    const model = "@cf/google/gemma-4-26b-a4b-it";
    const { answer } = await withTimeout(
      runDJAssistantTurn(ai, model, system, user, neuronBudget),
      90000,
      "Cloudflare AI antwoordde niet binnen 90 seconden. Probeer het opnieuw.",
    );
    return await completeResponse(answer, provider, false);
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
