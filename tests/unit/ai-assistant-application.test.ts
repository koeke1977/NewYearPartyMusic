import { describe, expect, it, vi } from "vitest";
import { executeDJAssistant } from "../../apps/worker/src/modules/ai/application/execute-dj-assistant";
import type { AssistantRepository } from "../../apps/worker/src/modules/ai/application/assistant-ports";

function createRepository(): AssistantRepository {
  return {
    rememberPreference: vi.fn(async () => false),
    loadContext: vi.fn(async () => ({ requestCounts: [], djPreferences: null })),
    readAnswerCache: vi.fn(async () => null),
    writeAnswerCache: vi.fn(async () => {}),
    claimRateLimit: vi.fn(async () => true),
    createNeuronBudget: vi.fn(async () => ({
      canAfford: () => false, record: vi.fn(async () => 0),
    })),
  };
}

describe("executeDJAssistant", () => {
  it("stops at the free-tier budget before cooldown or provider invocation", async () => {
    const repository = createRepository();
    const ai = { run: vi.fn() };
    const result = await executeDJAssistant({
      eventId: "event-1", eventName: "Test Party", ai,
      prompt: "Geef me wat disco-advies", repository, hash: async value => value,
    });
    expect(result.status).toBe(429);
    expect(result.body.error).toContain("veilige dagbudget");
    expect(repository.claimRateLimit).not.toHaveBeenCalled();
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("returns a cached answer without claiming the cooldown or invoking AI", async () => {
    const repository = createRepository();
    vi.mocked(repository.readAnswerCache).mockResolvedValue({ answer: "Prima!", spotifyMatches: [] });
    const result = await executeDJAssistant({
      eventId: "event-1", eventName: "Test Party",
      prompt: "Geef me disco-advies", repository, hash: async value => value,
    });
    expect(result.status).toBe(200);
    expect(result.body.cached).toBe(true);
    expect(result.body.spotifyMatches).toEqual([]);
    expect(repository.claimRateLimit).not.toHaveBeenCalled();
  });
});
