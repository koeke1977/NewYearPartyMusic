import type { AssistantContextSnapshot, CloudflareAIClient, AssistantNeuronBudget } from "./assistant-ports";
import { buildDJAssistantContext } from "../context/assistant-context";
import { buildEventMoment } from "../context/event-moment";
import { buildDJAssistantPrompt } from "../prompts/dj-assistant";
import { parseDJPreferences } from "../memory/dj-preferences";
import { runDJAssistantTurn } from "../orchestration/assistant-orchestrator";
import { ASSISTANT_MAX_OUTPUT_TOKENS } from "./neuron-budget-policy";
import { parseDJAssistantActionEnvelope } from "./execute-dj-assistant-actions";
import type { DJAssistantActionResult } from "./execute-dj-assistant-actions";

export const DJ_AUTOPILOT_QUEUE_THRESHOLD = 5;
export const DJ_AUTOPILOT_QUEUE_TARGET = 8;
export const DJ_AUTOPILOT_MAX_ADDS_PER_RUN = 3;

export interface DJAutopilotRepository {
  isEnabled(eventId: string): Promise<boolean>;
  claimRateLimit(): Promise<boolean>;
  acquireLock(eventId: string, nowEpochSeconds: number): Promise<boolean>;
  releaseLock(eventId: string, nowEpochSeconds: number): Promise<void>;
  loadContext(eventId: string): Promise<AssistantContextSnapshot>;
  readLastFailedAttempt(eventId: string): Promise<number>;
  recordFailedAttempt(eventId: string, nowEpochSeconds: number): Promise<void>;
  recordOutcome(eventId: string, outcome: DJAutopilotOutcome, at: string): Promise<void>;
}

export interface DJAutopilotExecutor {
  execute(
    prompt: string,
    actions: unknown[],
    canContinue: () => Promise<boolean>,
    snapshot: AssistantContextSnapshot,
  ): Promise<DJAssistantActionResult[]>;
}

export type DJAutopilotOutcome =
  | { status: "disabled" | "locked" | "queue_sufficient" | "cooldown" | "budget_exhausted"; queued: number }
  | { status: "completed"; queued: number; added: number; failed: number }
  | { status: "error"; queued: number; message: string };

/** Periodically tops up a short PartyQueue only while the DJ has explicitly enabled Autopilot. */
export async function runDJAutopilot(input: {
  eventId: string;
  eventName: string;
  ai?: CloudflareAIClient;
  repository: DJAutopilotRepository;
  createNeuronBudget(): Promise<AssistantNeuronBudget>;
  executor: DJAutopilotExecutor;
  now?: () => Date;
}): Promise<DJAutopilotOutcome> {
  const now = input.now || (() => new Date());
  const epochSeconds = () => Math.floor(now().getTime() / 1000);
  const finish = async (outcome: DJAutopilotOutcome): Promise<DJAutopilotOutcome> => {
    await input.repository.recordOutcome(input.eventId, outcome, now().toISOString()).catch(error => {
      console.error("DJ Autopilot telemetry write failed", error instanceof Error ? error.message : "unknown error");
    });
    return outcome;
  };
  if (!await input.repository.isEnabled(input.eventId)) return { status: "disabled", queued: 0 };
  const lockAt = epochSeconds();
  if (!await input.repository.acquireLock(input.eventId, lockAt)) return { status: "locked", queued: 0 };

  let queued = 0;
  try {
    if (!await input.repository.isEnabled(input.eventId)) return { status: "disabled", queued };
    const snapshot = await input.repository.loadContext(input.eventId);
    queued = snapshot.partyQueue.queued.length;
    if (queued > DJ_AUTOPILOT_QUEUE_THRESHOLD) return await finish({ status: "queue_sufficient", queued });

    const lastFailedAttempt = await input.repository.readLastFailedAttempt(input.eventId);
    if (lastFailedAttempt > 0 && epochSeconds() - lastFailedAttempt < 900) {
      return await finish({ status: "cooldown", queued });
    }
    if (!input.ai) return await finish({ status: "error", queued, message: "Cloudflare AI-binding ontbreekt." });
    if (!await input.repository.claimRateLimit()) return await finish({ status: "cooldown", queued });

    const count = Math.min(DJ_AUTOPILOT_MAX_ADDS_PER_RUN, DJ_AUTOPILOT_QUEUE_TARGET - queued);
    if (count <= 0) return await finish({ status: "queue_sufficient", queued });
    const prompt = "Vul PartyQueue autonoom aan: voeg maximaal " + count
      + " concrete tracks toe aan PartyQueue. Dit is een expliciete Autopilot-opdracht. "
      + "Combineer verschillende genres en decennia op basis van de actuele publieksvoorkeuren, toegestane sfeerfeedback en de eventfase. "
      + "Vermijd alle tracks die al door gasten aangevraagd zijn, in de geplande wachtrij staan of recent gespeeld zijn; vermijd ook een opeenvolging van dezelfde artiest. "
      + "Kies alleen bestaande, herkenbare nummers met exacte titel en artiest. Gebruik geen gokjes, remixes of alternatieve versies tenzij die expliciet passend zijn. "
      + "Voeg uitsluitend tracks toe; verwijder of herschik niets. Als er onvoldoende betrouwbare keuzes zijn, geef minder tracks of geen actie.";
    const context = buildDJAssistantContext({
      event: input.eventName,
      eventMoment: buildEventMoment(now()),
      djPreferences: parseDJPreferences(snapshot.djPreferences),
      partyQueue: snapshot.partyQueue,
    });
    const { system, user } = buildDJAssistantPrompt(context, prompt, [], true);
    const budget = await input.createNeuronBudget();
    if (!budget.canAfford(system.length + user.length, ASSISTANT_MAX_OUTPUT_TOKENS)) {
      return await finish({ status: "budget_exhausted", queued });
    }

    const { answer } = await runDJAssistantTurn(
      input.ai, "@cf/google/gemma-4-26b-a4b-it", system, user, budget,
    );
    if (!await input.repository.isEnabled(input.eventId)) {
      return await finish({ status: "disabled", queued });
    }
    const plan = parseDJAssistantActionEnvelope(answer);
    const addAction = plan?.actions.find(action => {
      const record = action as { type?: unknown };
      return record?.type === "add_tracks";
    }) as { type: "add_tracks"; tracks: Array<{ title: string; artist: string }> } | undefined;
    const seenArtists = new Set<string>();
    const safeTracks = (addAction?.tracks || []).filter(track => {
      const artist = track.artist.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
        .toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim();
      if (!artist || seenArtists.has(artist)) return false;
      seenArtists.add(artist);
      return true;
    }).slice(0, count);
    if (!safeTracks.length) {
      await input.repository.recordFailedAttempt(input.eventId, epochSeconds());
      return await finish({ status: "completed", queued, added: 0, failed: 0 });
    }

    const actions = await input.executor.execute(
      prompt,
      [{ type: "add_tracks", tracks: safeTracks }],
      () => input.repository.isEnabled(input.eventId),
      snapshot,
    );
    const added = actions.reduce((total, result) => total + (result.type === "add_tracks" ? result.succeeded : 0), 0);
    const failed = actions.reduce((total, result) => total + (result.type === "add_tracks" ? result.failed : 0), 0);
    if (added === 0) await input.repository.recordFailedAttempt(input.eventId, epochSeconds());
    return await finish({ status: "completed", queued, added, failed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Autopilot-fout.";
    await input.repository.recordFailedAttempt(input.eventId, epochSeconds()).catch(() => {});
    console.error("DJ Autopilot failed", message);
    return await finish({ status: "error", queued, message });
  } finally {
    await input.repository.releaseLock(input.eventId, lockAt).catch(error => {
      console.error("DJ Autopilot lock release failed", error instanceof Error ? error.message : "unknown error");
    });
  }
}
