import { describe, expect, it, vi } from "vitest";
import { createLocalAIBridgeClient } from "../../apps/worker/src/integrations/ai/local-ai-bridge";
import { executeDJAssistant } from "../../apps/worker/src/modules/ai/application/execute-dj-assistant";
import type { AssistantRepository } from "../../apps/worker/src/modules/ai/application/assistant-ports";

function repository(): AssistantRepository {
  return {
    rememberPreference: vi.fn(async () => false),
    loadContext: vi.fn(async () => ({ djPreferences: null })),
    loadConversation: vi.fn(async () => []),
    saveConversation: vi.fn(async () => {}),
    readAnswerCache: vi.fn(async () => null),
    writeAnswerCache: vi.fn(async () => {}),
    claimRateLimit: vi.fn(async () => true),
    createNeuronBudget: vi.fn(async () => ({
      canAfford: () => false,
      record: vi.fn(async () => 0),
    })),
  };
}

describe("PartyQueue Local AI Bridge client", () => {
  it("keeps the local bridge disabled when only its pre-provisioned token is present", () => {
    expect(createLocalAIBridgeClient({ token: "x".repeat(40) })).toBeUndefined();
  });

  it("requires a token when a bridge URL activates the integration", () => {
    expect(() => createLocalAIBridgeClient({ url: "https://bridge.example.com" })).toThrow(/LOCAL_AI_BRIDGE_TOKEN/);
  });

  it("requires HTTPS for remote bridge endpoints", () => {
    expect(() => createLocalAIBridgeClient({ url: "http://bridge.example.com", token: "x".repeat(40) })).toThrow(/HTTPS/);
  });

  it("rejects bridge URLs that contain paths, credentials or query strings", () => {
    const token = "x".repeat(40);
    expect(() => createLocalAIBridgeClient({ url: "https://bridge.example.com/private", token })).toThrow(/origin only/);
    expect(() => createLocalAIBridgeClient({ url: "https://user:pass@bridge.example.com", token })).toThrow(/origin only/);
    expect(() => createLocalAIBridgeClient({ url: "https://bridge.example.com?debug=1", token })).toThrow(/origin only/);
  });

  it("requires Cloudflare Access service-token values as a pair", () => {
    expect(() => createLocalAIBridgeClient({
      url: "https://bridge.example.com", token: "x".repeat(40), accessClientId: "client-id",
    })).toThrow(/both Cloudflare Access/);
  });

  it("returns a controlled error when the bridge response is not JSON", async () => {
    const fetcher = vi.fn(async () => new Response("not-json", { status: 502 }));
    const client = createLocalAIBridgeClient({ url: "https://bridge.example.com", token: "x".repeat(40), fetcher });
    await expect(client!.complete("system", "user")).rejects.toThrow(/invalid response/i);
  });

  it("requires a long secret and sends only system/user prompt data", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({ answer: "Disco naar rock: onverwacht, maar werkt!" }), { status: 200 }));
    const client = createLocalAIBridgeClient({ url: "https://bridge.example.com", token: "x".repeat(40), fetcher });
    expect(client).toBeDefined();
    await expect(client!.complete("DJ SYSTEM", "Maak het verrassend")).resolves.toContain("Disco");
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://bridge.example.com/v1/dj/turn");
    expect(init?.headers).toMatchObject({ authorization: "Bearer " + "x".repeat(40) });
    expect(JSON.parse(String(init?.body))).toEqual({ system: "DJ SYSTEM", user: "Maak het verrassend" });
  });

  it("uses local Claude first without consuming the Cloudflare neuron budget", async () => {
    const repo = repository();
    const localAI = { complete: vi.fn(async () => "Whaoww. Eerst disco, dan 90s eurodance!") };
    const cloudflare = { run: vi.fn() };
    const result = await executeDJAssistant({
      eventId: "event-1", eventName: "Kallo Rulez", sessionId: "session-1", ai: cloudflare, localAI,
      prompt: "Verras me", repository: repo, hash: async value => value,
    });
    expect(result.status).toBe(200);
    expect(result.body.provider).toBe("claude-code-local");
    expect(localAI.complete).toHaveBeenCalledOnce();
    expect(cloudflare.run).not.toHaveBeenCalled();
    expect(repo.createNeuronBudget).not.toHaveBeenCalled();
  });

  it("does not fall back to paid API or Cloudflare when Claude reaches its plan limit", async () => {
    const repo = repository();
    const localAI = { complete: vi.fn(async () => { throw new Error("Claude usage limit reached"); }) };
    const cloudflare = { run: vi.fn() };
    const result = await executeDJAssistant({
      eventId: "event-1", eventName: "Kallo Rulez", sessionId: "session-1", ai: cloudflare, localAI,
      prompt: "Nog een idee", repository: repo, hash: async value => value,
    });
    expect(result.status).toBe(429);
    expect(String(result.body.error)).toContain("Er wordt niet overgeschakeld");
    expect(cloudflare.run).not.toHaveBeenCalled();
  });
});
