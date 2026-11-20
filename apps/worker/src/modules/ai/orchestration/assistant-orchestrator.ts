import {
  extractCloudflareAssistantText,
  extractCloudflareToolCalls,
  runCloudflareAI,
  type CloudflareAIClient,
} from "../../../integrations/ai/cloudflare-ai";
import {
  searchSpotifyCatalogForAssistant,
  spotifyCatalogSearchTool,
  type SpotifyCatalogMatch,
} from "../../../integrations/ai/spotify-catalog-search";
import type { Env } from "../../../platform/env";
import { ASSISTANT_MAX_OUTPUT_TOKENS } from "../infrastructure/neuron-budget";
import type { AssistantNeuronBudget } from "../application/assistant-ports";

export type DJAssistantRunResult = {
  answer: string;
  spotifyMatches: SpotifyCatalogMatch[];
};

/**
 * Coordinates one bounded assistant turn. The provider gets only prompts and the
 * read-only catalogue tool; it never receives D1, OAuth user tokens or write tools.
 */
export async function runDJAssistantTurn(
  ai: CloudflareAIClient,
  env: Env,
  model: string,
  system: string,
  user: string,
  neuronBudget: AssistantNeuronBudget,
): Promise<DJAssistantRunResult> {
  const first = await runCloudflareAI(ai, model, {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    tools: [spotifyCatalogSearchTool],
    tool_choice: "auto",
    parallel_tool_calls: false,
    max_tokens: ASSISTANT_MAX_OUTPUT_TOKENS,
    temperature: 0.4,
    chat_template_kwargs: { enable_thinking: false },
  });

  await neuronBudget.record(first, system.length + user.length, ASSISTANT_MAX_OUTPUT_TOKENS);

  let answer: unknown = extractCloudflareAssistantText(first);
  let spotifyMatches: SpotifyCatalogMatch[] = [];
  const searchCall = extractCloudflareToolCalls(first)
    .find((call) => call.name === spotifyCatalogSearchTool.name);

  if (searchCall) {
    spotifyMatches = await searchSpotifyCatalogForAssistant(env, searchCall.arguments);
    if (spotifyMatches.length) {
      // A single bounded follow-up lets the model explain only catalogue-verified options.
      const followupUser = user + "\n\nVERIFIED SPOTIFY SEARCH RESULTS:\n" + JSON.stringify(spotifyMatches);
      const followupInputCharacters = system.length + followupUser.length + 180;
      if (neuronBudget.canAfford(followupInputCharacters, ASSISTANT_MAX_OUTPUT_TOKENS)) {
        const followup = await runCloudflareAI(ai, model, {
          messages: [
            {
              role: "system",
              content: system + " When verified Spotify search results are supplied, recommend only tracks present in those results and preserve exact Spotify titles and artists.",
            },
            { role: "user", content: followupUser },
          ],
          max_tokens: ASSISTANT_MAX_OUTPUT_TOKENS,
          temperature: 0.35,
          chat_template_kwargs: { enable_thinking: false },
        });
        await neuronBudget.record(followup, followupInputCharacters, ASSISTANT_MAX_OUTPUT_TOKENS);
        answer = extractCloudflareAssistantText(followup) || answer;
      } else {
        answer = "Ik heb de Spotify-zoekopdrachten gecontroleerd. Het veilige AI-dagbudget laat vandaag geen extra analyse meer toe; kies hieronder zelf de juiste Spotify-uitvoering.";
      }
    }
  }

  if (Array.isArray(answer)) {
    answer = answer.map((part) => typeof part === "string"
      ? part
      : part && typeof part === "object" && "text" in part && typeof part.text === "string"
        ? part.text
        : "").join("\n");
  }

  if (typeof answer !== "string" || !answer.trim()) {
    const root = first && typeof first === "object" ? first as Record<string, unknown> : null;
    console.error("DJ AI returned no text", JSON.stringify({
      provider: "cloudflare",
      keys: root ? Object.keys(root) : [],
      usage: root?.usage || null,
    }));
    throw new Error("Cloudflare AI gaf geen antwoordtekst terug. Probeer het opnieuw.");
  }

  return {
    answer: answer.slice(0, 8000),
    spotifyMatches,
  };
}
