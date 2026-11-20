import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../apps/worker/src/platform/env";

const { runCloudflareAI, extractCloudflareAssistantText, extractCloudflareToolCalls, searchSpotifyCatalogForAssistant } = vi.hoisted(() => ({
  runCloudflareAI: vi.fn(),
  extractCloudflareAssistantText: vi.fn((value: unknown) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "response" in value) return (value as { response: unknown }).response;
    if (value && typeof value === "object" && "choices" in value) return (value as { choices: Array<{ message: { content: unknown } }> }).choices[0]?.message?.content;
    return "";
  }),
  extractCloudflareToolCalls: vi.fn((value: unknown) => value && typeof value === "object" && "tool_calls" in value
    ? (value as { tool_calls: Array<{ name: string; arguments: unknown }> }).tool_calls
    : []),
  searchSpotifyCatalogForAssistant: vi.fn(),
}));

vi.mock("../../apps/worker/src/integrations/ai/cloudflare-ai", () => ({
  runCloudflareAI,
  extractCloudflareAssistantText,
  extractCloudflareToolCalls,
}));
vi.mock("../../apps/worker/src/integrations/ai/spotify-catalog-search", () => ({
  spotifyCatalogSearchTool: { name: "searchSpotifyTracks" },
  searchSpotifyCatalogForAssistant,
}));

import { runDJAssistantTurn } from "../../apps/worker/src/modules/ai/orchestration/assistant-orchestrator";

function makeBudget(canAfford = true) {
  return {
    usageKey: "dj_ai_neurons_2026-12-31",
    currentEstimatedNeurons: vi.fn(() => 0),
    canAfford: vi.fn(() => canAfford),
    record: vi.fn().mockResolvedValue(100),
  };
}

describe("DJ assistant orchestration", () => {
  const ai = { run: vi.fn() };
  const env = {} as Env;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs a simple answer with one provider call and no Spotify tool", async () => {
    runCloudflareAI.mockResolvedValueOnce({ response: "Zeker, ga voor disco." });

    await expect(runDJAssistantTurn(ai, env, "model", "system", "vraag", makeBudget())).resolves.toEqual({
      answer: "Zeker, ga voor disco.",
      spotifyMatches: [],
    });
    expect(runCloudflareAI).toHaveBeenCalledTimes(1);
    expect(searchSpotifyCatalogForAssistant).not.toHaveBeenCalled();
  });

  it("executes only the read-only Spotify tool and performs one verified follow-up", async () => {
    runCloudflareAI
      .mockResolvedValueOnce({ tool_calls: [{ name: "searchSpotifyTracks", arguments: { queries: ["Stardust"] } }] })
      .mockResolvedValueOnce({ response: "Music Sounds Better With You — Stardust." });
    searchSpotifyCatalogForAssistant.mockResolvedValueOnce([{
      query: "Stardust",
      tracks: [{ id: "track-id", uri: "spotify:track:track-id", name: "Music Sounds Better With You", artists: ["Stardust"], durationMs: 240000, albumImageUrl: null }],
    }]);

    const result = await runDJAssistantTurn(ai, env, "model", "system", "zoek een disco-track", makeBudget());

    expect(result.answer).toContain("Stardust");
    expect(result.spotifyMatches).toHaveLength(1);
    expect(searchSpotifyCatalogForAssistant).toHaveBeenCalledWith(env, { queries: ["Stardust"] });
    expect(runCloudflareAI).toHaveBeenCalledTimes(2);
    expect(runCloudflareAI.mock.calls[1][2].messages[1].content).toContain("VERIFIED SPOTIFY SEARCH RESULTS");
  });

  it("does not call Spotify or a follow-up when the model returns no tool call", async () => {
    runCloudflareAI.mockResolvedValueOnce({ response: "Hou het energiek." });
    await runDJAssistantTurn(ai, env, "model", "system", "advies", makeBudget());
    expect(runCloudflareAI).toHaveBeenCalledTimes(1);
    expect(searchSpotifyCatalogForAssistant).not.toHaveBeenCalled();
  });

  it("normalizes array content and bounds the final answer", async () => {
    extractCloudflareAssistantText.mockReturnValueOnce([{ text: "A" }, "B", { other: true }]);
    runCloudflareAI.mockResolvedValueOnce({ response: "ignored" });
    const result = await runDJAssistantTurn(ai, env, "model", "system", "vraag", makeBudget());
    expect(result.answer).toBe("A\nB\n");
  });

  it("skips the follow-up model call when the remaining daily budget is insufficient", async () => {
    runCloudflareAI
      .mockResolvedValueOnce({ tool_calls: [{ name: "searchSpotifyTracks", arguments: { queries: ["Stardust"] } }] });
    searchSpotifyCatalogForAssistant.mockResolvedValueOnce([{
      query: "Stardust",
      tracks: [{ id: "track-id", uri: "spotify:track:track-id", name: "Music Sounds Better With You", artists: ["Stardust"], durationMs: 240000, albumImageUrl: null }],
    }]);
    const budget = makeBudget(false);

    const result = await runDJAssistantTurn(ai, env, "model", "system", "zoek een disco-track", budget);

    expect(runCloudflareAI).toHaveBeenCalledTimes(1);
    expect(budget.canAfford).toHaveBeenCalledTimes(1);
    expect(result.answer).toContain("veilige AI-dagbudget");
    expect(result.spotifyMatches).toHaveLength(1);
  });

  it("rejects empty model output", async () => {
    runCloudflareAI.mockResolvedValueOnce({ response: "  " });
    await expect(runDJAssistantTurn(ai, env, "model", "system", "vraag", makeBudget()))
      .rejects.toThrow("Cloudflare AI gaf geen antwoordtekst terug.");
  });
});
