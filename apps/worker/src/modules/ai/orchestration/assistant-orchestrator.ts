import {
  extractCloudflareAssistantText,
  runCloudflareAI,
} from "../../../integrations/ai/cloudflare-ai";

import { ASSISTANT_MAX_OUTPUT_TOKENS } from "../application/neuron-budget-policy";
import type { AssistantNeuronBudget, CloudflareAIClient } from "../application/assistant-ports";

export type DJAssistantRunResult = { answer: string };

/** Runs one bounded AI turn with no Spotify tools or Spotify-derived context. */
export async function runDJAssistantTurn(
  ai: CloudflareAIClient,
  model: string,
  system: string,
  user: string,
  neuronBudget: AssistantNeuronBudget,
): Promise<DJAssistantRunResult> {
  const response = await runCloudflareAI(ai, model, {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_tokens: ASSISTANT_MAX_OUTPUT_TOKENS,
    temperature: 0.4,
    chat_template_kwargs: { enable_thinking: false },
  });

  await neuronBudget.record(response, system.length + user.length, ASSISTANT_MAX_OUTPUT_TOKENS);

  let answer: unknown = extractCloudflareAssistantText(response);
  if (Array.isArray(answer)) {
    answer = answer.map((part) => typeof part === "string"
      ? part
      : part && typeof part === "object" && "text" in part && typeof part.text === "string"
        ? part.text
        : "").join("\n");
  }

  if (typeof answer !== "string" || !answer.trim()) {
    const root = response && typeof response === "object" ? response as Record<string, unknown> : null;
    console.error("DJ AI returned no text", JSON.stringify({
      provider: "cloudflare",
      keys: root ? Object.keys(root) : [],
      usage: root?.usage || null,
    }));
    throw new Error("Cloudflare AI gaf geen antwoordtekst terug. Probeer het opnieuw.");
  }

  return { answer: answer.slice(0, 8000) };
}
