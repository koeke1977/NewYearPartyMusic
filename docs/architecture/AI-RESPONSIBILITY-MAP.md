# AI responsibility map

## Current state

The AI route is `POST /api/dj/ai/assistant` in `apps/worker/src/index.ts`. It still combines several concerns, although the first extraction steps are now in place:

1. Detects explicit preference statements and delegates DJ preference persistence to a D1 repository.
2. Loads active queue, recent played tracks, request counts, saved order, preferences and accepted-set history through a bounded context repository.
3. Computes the Belgian local event-time phase.
4. Builds the AI context.
5. Constructs the system and user prompts.
6. Calls the Cloudflare Workers AI binding.
7. Interprets model tool calls.
8. Executes read-only Spotify catalogue searches requested by the model.
9. Runs a bounded follow-up model call with verified Spotify results.
10. Normalizes the model response.
11. Applies cache and rate-limit rules.
12. Persists the answer cache and maps provider/quota errors to HTTP responses.

This is too much responsibility for one route and is the primary AI extraction target.

## Already extracted

| Responsibility | Module | Status |
|---|---|---|
| DJ assistant system/user prompt construction | `modules/ai/prompts/dj-assistant.ts` | Extracted |
| Belgian local event-time phase calculation | `modules/ai/context/event-moment.ts` | Extracted |
| Provider-independent assistant context assembly and queue ordering | `modules/ai/context/assistant-context.ts` | Extracted; route delegates to it |
| Defensive DJ preference parsing and explicit preference intent | `modules/ai/memory/dj-preferences.ts` | Extracted; D1 writes remain in route |
| Cloudflare Workers AI invocation and response/tool-call normalization | `integrations/ai/cloudflare-ai.ts` | Extracted; route delegates to it |
| Spotify read-only search tool schema, argument validation, query bounds and result mapping | `integrations/ai/spotify-catalog-search.ts` | Extracted; route delegates to it |
| One bounded assistant turn, read-only tool dispatch, verified-result follow-up and answer normalization | `modules/ai/orchestration/assistant-orchestrator.ts` | Extracted; route delegates to it |
| Daily free-tier Neuron estimation, UTC usage tracking and follow-up budget checks | `modules/ai/infrastructure/neuron-budget.ts` | Extracted; route preflights and orchestrator records usage |
| DJ preference persistence, answer cache and atomic eight-second cooldown | `modules/ai/infrastructure/assistant-settings-repository.ts` | Extracted; route delegates all persistence |
| Bounded queue/history/count/settings reads for assistant context | `modules/ai/infrastructure/assistant-context-repository.ts` | Extracted; route receives a typed snapshot |

The prompt builder receives typed context and a question, and returns a system/user message pair. It does not access D1, Spotify, Cloudflare bindings or HTTP requests.

## Target modules

| Module | Single responsibility |
|---|---|
| `ai/contracts/assistant.ts` | Typed input, context, proposal and result contracts |
| `ai/context/party-context.ts` | Build the minimal context snapshot from application-owned data |
| `ai/context/event-moment.ts` | Calculate Belgian local event phase and countdown values using an injected clock |
| `ai/memory/dj-preferences.ts` | Read/write explicit DJ preferences and accepted-set history through a repository |
| `ai/prompts/dj-assistant.ts` | Own prompt wording and prompt version |
| `ai/providers/cloudflare-workers-ai.ts` | Adapt the Cloudflare AI binding to a provider contract |
| `ai/tools/spotify-catalog-search.ts` | Expose bounded, read-only Spotify search to AI tool calls |
| `ai/policies/assistant-output.ts` | Validate, normalize and bound model output |
| `ai/infrastructure/answer-cache.ts` | Cache answers using context, prompt and provider version keys |
| `ai/infrastructure/rate-limit.ts` | Enforce the current AI request cooldown |
| `ai/orchestration/assistant-orchestrator.ts` | Coordinate context, prompt, provider, tool calls and output policy |
| `ai/modules/party-advisor.ts` | Advice about musical direction and party energy |
| `ai/modules/queue-optimizer.ts` | Propose an ordering of the supplied queue, preserving every item exactly once |
| `ai/modules/starter-list.ts` | Propose new starter tracks and verify them through Spotify search |
| `ai/modules/queue-fill.ts` | Suggest additions for a queue gap and verify through Spotify search |

## Trust and side-effect rules

- Model output is untrusted input. Parse and validate every tool call and response.
- The AI provider has no direct D1 binding and no Spotify user OAuth token.
- The AI Spotify tool can search the public catalogue only; it cannot add tracks, reorder requests, control playback or change settings.
- Application use cases own all writes and privileged actions.
- The DJ must explicitly confirm queue changes and track additions.
- AI advice and proposals must be clearly distinguished from completed actions.
- Memory changes must be explicit, bounded, inspectable and removable.
- Prompt wording must be versioned independently from provider implementation.
- Cloudflare Workers AI remains the default provider; no paid fallback is allowed unless the product decision changes.

## Extraction sequence

1. Keep the prompt builder pure and maintain prompt contract tests. (done)
2. Extract event-time calculation and typed context assembly. (event time and context builder done)
3. Extract preference persistence behind a repository. (preference rules and D1 persistence done; accepted-set history remains read-only)
4. Extract the Cloudflare provider adapter and response normalization. (adapter done)
5. Extract the Spotify read-only tool adapter. (done)
6. Extract rate limiting and answer caching.
7. Add the orchestrator and turn the HTTP route into a thin adapter. (orchestrator extracted; route now delegates to it, cache/rate/memory persistence remain)
8. Preserve the daily free-tier Neuron guardrail as an independently tested infrastructure module. (done)
9. Move each AI action into a named, independently testable use case.
