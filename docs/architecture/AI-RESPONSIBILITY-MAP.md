# AI responsibility map

**Snapshot:** `refactor/architecture-foundation`, reviewed 2026-11-20.

## Current request flow

`POST /api/dj/ai/assistant` is implemented by `routes/dj-ai.ts`. The route applies DJ-session middleware, parses and bounds the prompt, calls the environment composition adapter and serializes the application result. It does not own the assistant orchestration.

```text
routes/dj-ai.ts
  → platform/composition/ai-assistant.ts
      → modules/ai/application/execute-dj-assistant.ts
          → context + prompt + memory policy
          → AssistantRepository port
          → neuron-budget policy
          → modules/ai/orchestration/assistant-orchestrator.ts
              → integrations/ai/cloudflare-ai.ts
              → integrations/ai/spotify-catalog-search.ts (read-only tool)
```

## Current module ownership

| Responsibility | Current module |
|---|---|
| HTTP authentication, prompt validation and response serialization | `routes/dj-ai.ts` + `routes/dj-auth.ts` |
| Cloudflare environment and concrete dependency wiring | `platform/composition/ai-assistant.ts` |
| End-to-end assistant workflow | `modules/ai/application/execute-dj-assistant.ts` |
| Repository contract | `modules/ai/application/assistant-ports.ts` |
| Event/queue context projection and saved-order/history parsing | `modules/ai/context/assistant-context.ts` |
| Belgian event-time phase | `modules/ai/context/event-moment.ts` |
| Prompt wording and message construction | `modules/ai/prompts/dj-assistant.ts` |
| Explicit preference intent parsing | `modules/ai/memory/dj-preferences.ts` |
| Bounded turn, read-only tool dispatch, verified-result follow-up and answer normalization | `modules/ai/orchestration/assistant-orchestrator.ts` |
| Cloudflare Workers AI invocation and provider response normalization | `integrations/ai/cloudflare-ai.ts` |
| Spotify catalogue tool schema, validation, query bounds and result mapping | `integrations/ai/spotify-catalog-search.ts` |
| D1 context snapshot reads | `modules/ai/infrastructure/assistant-context-repository.ts` |
| Preference persistence, answer cache and atomic eight-second cooldown | `modules/ai/infrastructure/assistant-settings-repository.ts` |
| Daily Neuron usage persistence and budget calculation | `modules/ai/infrastructure/neuron-budget.ts` + `modules/ai/application/neuron-budget-policy.ts` |

## Current application workflow

1. Parse explicit DJ preference intent and persist only when the prompt expresses a preference.
2. Load a bounded snapshot of active queue, recently played tracks, request counts, saved queue order, preferences and accepted-set history.
3. Calculate the Belgian local event-time phase and construct typed assistant context.
4. Build system and user prompts using the prompt module.
5. Derive a cache key from provider, prompt/context and Spotify tool version; return a cached answer when available.
6. Check the existing daily free-tier Neuron budget (7,500-Neuron ceiling with a 2,500-Neuron safety buffer) before any model invocation.
7. Claim the existing atomic eight-second cooldown.
8. Invoke Cloudflare Workers AI through the provider adapter.
9. If the model requests the permitted Spotify catalogue tool, validate/bound the arguments, search the public catalogue and provide verified results in the bounded follow-up call.
10. Normalize the final answer, persist the cache and map provider/quota failures to stable HTTP results.

The composition adapter builds the `AssistantRepository` implementation from D1 functions and creates the budget repository. The application use case consumes the application-owned port. This is an application port, but the infrastructure composition is still a concrete D1/Cloudflare adapter.

## Trust, authority and cost invariants

- Model output and tool arguments are untrusted; validate and bound both.
- The AI provider has no direct D1 binding and no Spotify DJ OAuth token.
- The only Spotify capability exposed to AI is bounded, read-only public catalogue search.
- AI cannot add tracks, reorder requests, moderate requests, change settings, or control Spotify playback.
- Queue proposals must be validated against the current queue and require explicit DJ confirmation before a save callback is invoked.
- Selected track additions are DJ-triggered UI actions, performed through the normal authenticated DJ API and request application workflow.
- No paid AI provider or paid fallback is permitted without a separate explicit decision.
- Keep the daily budget guard, safety buffer, cooldown, cache and error handling intact.

## Remaining work

1. Add focused tests around the application use case's cache-hit, budget-exhausted, cooldown, provider-missing, tool-call, provider-error and memory-update paths if any are not already covered.
2. Keep the repository port application-owned. Review whether the `hash` dependency should remain part of the use-case input or be represented as a narrower cache-key service; do not change it without a concrete benefit.
3. Keep `platform/composition/ai-assistant.ts` as the only owner of Cloudflare Env and concrete D1/provider wiring for this workflow.
4. Keep the route thin: no D1 calls, prompt construction, event-time calculation, provider invocation, cache/rate-limit policy or tool execution.
5. The assistant currently has one orchestrated workflow. Add separately named AI use cases only when a distinct behaviour and test boundary exists; do not create speculative `party-advisor`, `queue-optimizer`, `starter-list` or `queue-fill` backend modules merely to mirror frontend modes.

## Related implementation

- `docs/architecture/API-INVENTORY.md`
- `docs/architecture/WORKER-RESPONSIBILITY-MAP.md`
- `docs/architecture/ENGINEERING-STANDARD.md`
