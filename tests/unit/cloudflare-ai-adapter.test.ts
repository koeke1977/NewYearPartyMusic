import { describe, expect, it, vi } from "vitest";
import {
  extractCloudflareAssistantText,
  extractCloudflareToolCalls,
  runCloudflareAI,
} from "../../apps/worker/src/integrations/ai/cloudflare-ai";

describe("Cloudflare Workers AI adapter", () => {
  it("delegates the model invocation without changing its input", async () => {
    const input = { messages: [{ role: "user", content: "hello" }], temperature: 0.2 };
    const run = vi.fn().mockResolvedValue({ response: "Hoi!" });
    await expect(runCloudflareAI({ run }, "test-model", input)).resolves.toEqual({ response: "Hoi!" });
    expect(run).toHaveBeenCalledWith("test-model", input);
  });

  it("extracts text from supported Workers AI response envelopes", () => {
    expect(extractCloudflareAssistantText("plain text")).toBe("plain text");
    expect(extractCloudflareAssistantText({ response: "root response" })).toBe("root response");
    expect(extractCloudflareAssistantText({ result: { response: "nested response" } })).toBe("nested response");
    expect(extractCloudflareAssistantText({ choices: [{ message: { content: "chat response" } }] })).toBe("chat response");
    expect(extractCloudflareAssistantText({ output_text: "output text" })).toBe("output text");
  });

  it("normalizes tool calls from root, nested and chat-completion envelopes", () => {
    expect(extractCloudflareToolCalls({
      choices: [{ message: { tool_calls: [{ function: { name: "searchSpotifyTracks", arguments: '{"queries":["a"]}' } }] } }],
    })).toEqual([{ name: "searchSpotifyTracks", arguments: '{"queries":["a"]}' }]);
    expect(extractCloudflareToolCalls({
      result: { tool_calls: [{ name: "searchSpotifyTracks", arguments: { queries: ["b"] } }] },
    })).toEqual([{ name: "searchSpotifyTracks", arguments: { queries: ["b"] } }]);
    expect(extractCloudflareToolCalls({ tool_calls: "not-an-array" })).toEqual([]);
  });
});
