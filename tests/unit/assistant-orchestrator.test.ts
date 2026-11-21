import { beforeEach, describe, expect, it, vi } from "vitest";

const { runCloudflareAI, extractCloudflareAssistantText } = vi.hoisted(() => ({
  runCloudflareAI: vi.fn(),
  extractCloudflareAssistantText: vi.fn((value: unknown) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "response" in value) return (value as { response: unknown }).response;
    if (value && typeof value === "object" && "choices" in value) return (value as { choices: Array<{ message: { content: unknown } }> }).choices[0]?.message?.content;
    return "";
  }),
}));

vi.mock("../../apps/worker/src/integrations/ai/cloudflare-ai", () => ({
  runCloudflareAI,
  extractCloudflareAssistantText,
}));

import { runDJAssistantTurn } from "../../apps/worker/src/modules/ai/orchestration/assistant-orchestrator";

function makeBudget() {
  return {
    usageKey: "dj_ai_neurons_2026-12-31",
    currentEstimatedNeurons: vi.fn(() => 0),
    canAfford: vi.fn(() => true),
    record: vi.fn().mockResolvedValue(100),
  };
}

describe("DJ assistant orchestration", () => {
  const ai = { run: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    runCloudflareAI.mockReset();
  });

  it("runs one model call without Spotify tools or Spotify-derived context", async () => {
    runCloudflareAI.mockResolvedValueOnce({ response: "Zeker, ga voor disco." });
    const result = await runDJAssistantTurn(ai, "model", "system", "vraag", makeBudget());

    expect(result).toEqual({ answer: "Zeker, ga voor disco." });
    expect(runCloudflareAI).toHaveBeenCalledTimes(1);
    const request = runCloudflareAI.mock.calls[0][2];
    expect(request.tools).toBeUndefined();
    expect(request.messages[0].content).toBe("system");
    expect(request.messages[1].content).toBe("vraag");
    expect(request.temperature).toBe(0.4);
  });

  it("uses a more exploratory sampling temperature for surprise/discovery requests", async () => {
    runCloudflareAI.mockResolvedValueOnce({ response: "Een verrassende selectie." });
    await runDJAssistantTurn(ai, "model", "system", "Geef me een verrassende uiteenlopende lijst nummers.", makeBudget());
    const request = runCloudflareAI.mock.calls[0][2];
    expect(request.temperature).toBe(0.85);
  });

  it("normalizes array content and bounds the final answer", async () => {
    extractCloudflareAssistantText.mockReturnValueOnce([{ text: "A" }, "B", { other: true }]);
    runCloudflareAI.mockResolvedValueOnce({ response: "ignored" });
    const result = await runDJAssistantTurn(ai, "model", "system", "vraag", makeBudget());
    expect(result.answer).toBe("A\nB\n");
  });

  it("rejects empty model output", async () => {
    runCloudflareAI.mockResolvedValueOnce({ response: "  " });
    await expect(runDJAssistantTurn(ai, "model", "system", "vraag", makeBudget()))
      .rejects.toThrow("Cloudflare AI gaf geen antwoordtekst terug.");
  });
});
