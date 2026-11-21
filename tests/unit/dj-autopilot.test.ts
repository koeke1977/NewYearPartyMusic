import { describe, expect, it, vi } from "vitest";
import { runDJAutopilot } from "../../apps/worker/src/modules/ai/application/dj-autopilot";
import type { DJAutopilotRepository } from "../../apps/worker/src/modules/ai/application/dj-autopilot";
import type { AssistantContextSnapshot } from "../../apps/worker/src/modules/ai/application/assistant-ports";

const snapshot: AssistantContextSnapshot = {
  djPreferences: null,
  partyQueue: {
    activity: { totalRequests: 3, uniqueTracksRequested: 3, pending: 0, approved: 0, queued: 2, played: 1, rejected: 0, failed: 0, topArtists: [] },
    queued: [
      { id: "q1", track: "Music Sounds Better With You — Stardust", durationMs: 360000 },
      { id: "q2", track: "Murder on the Dancefloor — Sophie Ellis-Bextor", durationMs: 230000 },
    ],
    recentlyPlayed: [{ track: "Freed From Desire — Gala", playedAt: "2026-11-21T18:00:00Z" }],
    audience: { respondents: 8, genres: [{ label: "Disco", guests: 5, share: 0.62 }], subgenres: [], decades: [], moods: [], averageEnergy: 7 },
    crowdFeedback: { eligible: true, respondents: 5, windowMinutes: 30, atmosphere: { good: 4, neutral: 1, bad: 0 }, averageEnergy: 4, trend: "positive" },
  },
};

function repository(overrides: Partial<DJAutopilotRepository> = {}) {
  return {
    isEnabled: vi.fn(async () => true),
    acquireLock: vi.fn(async () => true),
    releaseLock: vi.fn(async () => {}),
    loadContext: vi.fn(async () => snapshot),
    readLastFailedAttempt: vi.fn(async () => 0),
    recordFailedAttempt: vi.fn(async () => {}),
    ...overrides,
  };
}

function budget(canAfford = true) {
  return { canAfford: vi.fn(() => canAfford), record: vi.fn(async () => 10) };
}

describe("DJ Autopilot", () => {
  it("is opt-in and does not acquire a lock or call AI while disabled", async () => {
    const repo = repository({ isEnabled: vi.fn(async () => false) });
    const ai = { run: vi.fn() };
    const result = await runDJAutopilot({
      eventId: "NYE2026", eventName: "New Year's Eve", ai, repository: repo,
      createNeuronBudget: async () => budget(),
      executor: { execute: vi.fn() },
    });
    expect(result.status).toBe("disabled");
    expect(repo.acquireLock).not.toHaveBeenCalled();
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("does not spend AI budget when the queue is already above the refill threshold", async () => {
    const repo = repository({ loadContext: vi.fn(async () => ({
      ...snapshot, partyQueue: { ...snapshot.partyQueue, queued: Array(6).fill(snapshot.partyQueue.queued[0]) },
    })) });
    const createBudget = vi.fn(async () => budget());
    const result = await runDJAutopilot({
      eventId: "NYE2026", eventName: "New Year's Eve", ai: { run: vi.fn() },
      repository: repo, createNeuronBudget: createBudget, executor: { execute: vi.fn() },
    });
    expect(result).toMatchObject({ status: "queue_sufficient", queued: 6 });
    expect(createBudget).not.toHaveBeenCalled();
  });

  it("uses audience and PartyQueue context, verifies a bounded add plan and executes it", async () => {
    const repo = repository();
    const ai = {
      run: vi.fn(async (_model: string, _input: Record<string, unknown>) => ({
        response: JSON.stringify({
          answer: "Ik vul de wachtrij aan met passende variatie.",
          actions: [{ type: "add_tracks", tracks: [
            { title: "September", artist: "Earth, Wind & Fire" },
            { title: "Gimme! Gimme! Gimme!", artist: "ABBA" },
          ] }],
        }),
      })),
    };
    const executor = { execute: vi.fn(async (_prompt: string, actions: unknown[], canContinue: () => Promise<boolean>) => {
      expect(await canContinue()).toBe(true);
      expect(actions).toEqual([{ type: "add_tracks", tracks: [
        { title: "September", artist: "Earth, Wind & Fire" },
        { title: "Gimme! Gimme! Gimme!", artist: "ABBA" },
      ] }]);
      return [{ type: "add_tracks" as const, succeeded: 2, alreadyPresent: 0, failed: 0, details: [] }];
    }) };
    const dailyBudget = budget();
    const result = await runDJAutopilot({
      eventId: "NYE2026", eventName: "New Year's Eve", ai, repository: repo,
      createNeuronBudget: async () => dailyBudget, executor,
      now: () => new Date("2026-12-31T21:00:00.000Z"),
    });
    expect(result).toEqual({ status: "completed", queued: 2, added: 2, failed: 0 });
    expect(ai.run).toHaveBeenCalledOnce();
    const modelInput = ai.run.mock.calls[0][1];
    const userMessage = (modelInput.messages as Array<{ content: string }>)[1].content;
    expect(userMessage).toContain("Disco");
    expect(userMessage).toContain("Music Sounds Better With You");
    expect(userMessage).toContain("Freed From Desire");
    expect(executor.execute).toHaveBeenCalledOnce();
    expect(repo.releaseLock).toHaveBeenCalledOnce();
    expect(dailyBudget.record).toHaveBeenCalledOnce();
  });

  it("respects a failed-attempt cooldown and the daily free-tier budget", async () => {
    const cooldownRepo = repository({ readLastFailedAttempt: vi.fn(async () => 1_799_999_500) });
    const ai = { run: vi.fn() };
    const common = {
      eventId: "NYE2026", eventName: "New Year's Eve", ai,
      createNeuronBudget: async () => budget(false), executor: { execute: vi.fn() },
      now: () => new Date(1_800_000_000_000),
    };
    const cooldown = await runDJAutopilot({ ...common, repository: cooldownRepo });
    expect(cooldown.status).toBe("cooldown");
    expect(ai.run).not.toHaveBeenCalled();

    const budgetRepo = repository();
    const exhausted = await runDJAutopilot({ ...common, repository: budgetRepo });
    expect(exhausted.status).toBe("budget_exhausted");
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("releases its lease after an AI error", async () => {
    const repo = repository();
    const result = await runDJAutopilot({
      eventId: "NYE2026", eventName: "New Year's Eve",
      ai: { run: vi.fn(async () => { throw new Error("provider down"); }) },
      repository: repo, createNeuronBudget: async () => budget(),
      executor: { execute: vi.fn() },
    });
    expect(result).toMatchObject({ status: "error", message: "provider down" });
    expect(repo.recordFailedAttempt).toHaveBeenCalledOnce();
    expect(repo.releaseLock).toHaveBeenCalledOnce();
  });
});
