import { describe, expect, it, vi } from "vitest";
import { executeDJAssistant } from "../../apps/worker/src/modules/ai/application/execute-dj-assistant";
import type { AssistantRepository } from "../../apps/worker/src/modules/ai/application/assistant-ports";

function createRepository(): AssistantRepository {
  return {
    rememberPreference: vi.fn(async () => false),
    loadContext: vi.fn(async () => ({ djPreferences: null })),
    loadConversation: vi.fn(async () => []),
    saveConversation: vi.fn(async () => {}),
    readAnswerCache: vi.fn(async () => null),
    writeAnswerCache: vi.fn(async () => {}),
    claimRateLimit: vi.fn(async () => true),
    createNeuronBudget: vi.fn(async () => ({
      canAfford: () => true, record: vi.fn(async () => 0),
    })),
  };
}

describe("executeDJAssistant", () => {
  it("stops at the free-tier budget before cooldown or provider invocation", async () => {
    const repository = createRepository();
    vi.mocked(repository.createNeuronBudget).mockResolvedValue({
      canAfford: () => false, record: vi.fn(async () => 0),
    });
    const ai = { run: vi.fn() };
    const result = await executeDJAssistant({
      eventId: "event-1", eventName: "Test Party", sessionId: "session-1", ai,
      prompt: "Geef me wat disco-advies", repository, hash: async value => value,
    });
    expect(result.status).toBe(429);
    expect(result.body.error).toContain("veilige dagbudget");
    expect(repository.claimRateLimit).not.toHaveBeenCalled();
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("returns a cached answer without claiming the cooldown or invoking AI", async () => {
    const repository = createRepository();
    vi.mocked(repository.readAnswerCache).mockResolvedValue({ answer: "Prima!" });
    const result = await executeDJAssistant({
      eventId: "event-1", eventName: "Test Party", sessionId: "session-1",
      prompt: "Geef me disco-advies", repository, hash: async value => value,
    });
    expect(result.status).toBe(200);
    expect(result.body.cached).toBe(true);
    expect(result.body.spotifyMatches).toEqual([]);
    expect(repository.claimRateLimit).not.toHaveBeenCalled();
  });

  it("uses the local Claude subscription bridge before the Cloudflare neuron budget", async () => {
    const repository = createRepository();
    const complete = vi.fn(async () => "Maak er een disco-versus-rock moment van!");
    const result = await executeDJAssistant({
      eventId: "event-1", eventName: "Test Party", sessionId: "session-1",
      prompt: "Verras me", repository, hash: async value => value,
      localAI: { complete },
    });
    expect(result.status).toBe(200);
    expect(result.body.provider).toBe("claude-code-local");
    expect(result.body.answer).toBe("Maak er een disco-versus-rock moment van!");
    expect(complete).toHaveBeenCalledOnce();
    expect(repository.createNeuronBudget).not.toHaveBeenCalled();
    expect(repository.writeAnswerCache).toHaveBeenCalledOnce();
    expect(repository.saveConversation).toHaveBeenCalledWith("event-1", "session-1", "Verras me", "Maak er een disco-versus-rock moment van!");
  });

  it("uses recent DJ/AI turns to resolve follow-up questions and persists the next answer", async () => {
    const repository = createRepository();
    vi.mocked(repository.loadConversation).mockResolvedValue([
      { role: "user", content: "Maak een gevarieerde lijst." },
      { role: "assistant", content: "1. Music Sounds Better With You — Stardust\\n2. Freed From Desire — Gala" },
    ]);
    const complete = vi.fn(async (_system: string, user: string) => {
      expect(user).toContain("Music Sounds Better With You");
      expect(user).toContain("DJ QUESTION:\nMaak die lijst commerciëler");
      return "Vervang de minder bekende keuzes door herkenbare dancehits.";
    });
    const result = await executeDJAssistant({
      eventId: "event-1", eventName: "Test Party", sessionId: "session-1",
      prompt: "Maak die lijst commerciëler", repository, hash: async value => value,
      localAI: { complete },
    });
    expect(result.status).toBe(200);
    expect(result.body.conversationSaved).toBe(true);
    expect(repository.saveConversation).toHaveBeenCalledWith(
      "event-1", "session-1", "Maak die lijst commerciëler",
      "Vervang de minder bekende keuzes door herkenbare dancehits.",
    );
  });

  it("executes an explicit queue command and never caches a mutating AI turn", async () => {
    const repository = createRepository();
    const actionExecutor = { execute: vi.fn(async () => [{
      type: "add_tracks" as const, succeeded: 1, alreadyPresent: 0, failed: 0,
      details: ["Music Sounds Better With You — Stardust: toegevoegd"],
    }]) };
    const complete = vi.fn(async () => JSON.stringify({
      answer: "Ik voeg de gevraagde track toe.",
      actions: [{ type: "add_tracks", tracks: [{ title: "Music Sounds Better With You", artist: "Stardust" }] }],
    }));
    const result = await executeDJAssistant({
      eventId: "event-1", eventName: "Test Party", sessionId: "session-1",
      prompt: "Voeg Music Sounds Better With You van Stardust toe aan PartyQueue",
      repository, hash: async value => value, localAI: { complete }, actionExecutor,
    });
    expect(result.status).toBe(200);
    expect(actionExecutor.execute).toHaveBeenCalledOnce();
    expect(result.body.answer).toContain("1 toegevoegd");
    expect(repository.readAnswerCache).not.toHaveBeenCalled();
    expect(repository.writeAnswerCache).not.toHaveBeenCalled();
    expect(repository.saveConversation).toHaveBeenCalledOnce();
  });

  it("returns a controlled error when the local AI bridge never responds", async () => {
    vi.useFakeTimers();
    const repository = createRepository();
    const pending = executeDJAssistant({
      eventId: "event-1", eventName: "Test Party", sessionId: "session-1",
      prompt: "Verras me", repository, hash: async value => value,
      localAI: { complete: () => new Promise(() => {}) },
    });
    await vi.advanceTimersByTimeAsync(95000);
    const result = await pending;
    expect(result.status).toBe(502);
    expect(String(result.body.error)).toContain("niet tijdig geantwoord");
    vi.useRealTimers();
  });

  it("does not fall back to a paid API when the local subscription reaches its limit", async () => {
    const repository = createRepository();
    const ai = { run: vi.fn() };
    const result = await executeDJAssistant({
      eventId: "event-1", eventName: "Test Party", sessionId: "session-1", ai,
      prompt: "Verras me", repository, hash: async value => value,
      localAI: { complete: async () => { throw new Error("weekly usage limit reached"); } },
    });
    expect(result.status).toBe(429);
    expect(String(result.body.error)).toContain("betaalde API-kosten");
    expect(ai.run).not.toHaveBeenCalled();
    expect(repository.createNeuronBudget).not.toHaveBeenCalled();
  });
});
