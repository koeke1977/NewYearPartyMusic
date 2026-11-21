# AI responsibility map

**Snapshot:** `refactor/architecture-mainline`, based on `main` commit `3100095d09ff3065f7bc55c7de73bb35260aaea6`; reviewed 2026-11-21.

## Current request flow

`POST /api/dj/ai/assistant` is a Spotify-independent advice endpoint. The route authenticates the DJ session, validates the prompt (1–600 characters), calls the environment composition adapter and serializes the application result.

```text
routes/dj-ai.ts
  → platform/composition/ai-assistant.ts
      → modules/ai/application/execute-dj-assistant.ts
          → remember explicit DJ preference
          → load DJ-authored preference snapshot
          → derive Belgian event-time moment
          → build context and prompt
          → check answer cache / cooldown / free-tier budget
          → local Claude Code bridge (when configured)
            or Cloudflare Workers AI
```

The separate `/api/dj/ai/music/search` and `/api/dj/ai/music/add` endpoints are normal authenticated DJ application actions. They are not tools exposed to the AI model and are not called by the assistant orchestration.

## Current module ownership

| Responsibility | Current module |
|---|---|
| DJ authentication, prompt validation and HTTP response mapping | `routes/dj-ai.ts` + `routes/dj-auth.ts` |
| Cloudflare environment and concrete dependency wiring | `platform/composition/ai-assistant.ts` |
| End-to-end assistant workflow, cache, provider selection, limits and stable errors | `modules/ai/application/execute-dj-assistant.ts` |
| Application-owned repository and provider contracts | `modules/ai/application/assistant-ports.ts` |
| Minimal AI context projection | `modules/ai/context/assistant-context.ts` |
| Belgian local event-time phase | `modules/ai/context/event-moment.ts` |
| System/user prompt and creative DJ guidance | `modules/ai/prompts/dj-assistant.ts` |
| Explicit DJ preference detection, parsing and bounded profile | `modules/ai/memory/dj-preferences.ts` |
| Bounded Cloudflare AI turn and response normalization | `modules/ai/orchestration/assistant-orchestrator.ts` |
| Cloudflare Workers AI invocation and provider response normalization | `integrations/ai/cloudflare-ai.ts` |
| Authenticated local Claude Code bridge protocol | `integrations/ai/local-ai-bridge.ts` |
| D1 preference snapshot reads | `modules/ai/infrastructure/assistant-context-repository.ts` |
| Explicit preference persistence, answer cache and atomic eight-second cooldown | `modules/ai/infrastructure/assistant-settings-repository.ts` |
| Daily Neuron usage persistence and budget calculation | `modules/ai/infrastructure/neuron-budget.ts` + `modules/ai/application/neuron-budget-policy.ts` |

## Data boundary and behaviour

The AI context contains only:
- Event name and derived Belgian local event time.
- Explicit DJ-authored preferences persisted in the event profile.
- The current DJ-authored question.

The AI receives **no** Spotify catalogue results, track or artist metadata, album art, playback state, live queue, guest requests, request counts, saved queue order, accepted-set history or Spotify-derived usage metrics. No Spotify search tool is registered with the model. The assistant response returns an empty `spotifyMatches` array for compatibility; it is not a Spotify search result.

Track ideas are unverified suggestions based on general model knowledge. The DJ must search for them separately using the normal Spotify catalogue endpoint and explicitly choose any action. The model cannot add tracks, reorder or moderate requests, alter settings, or control playback.

The prompt deliberately permits sharp genre, decade and energy changes. Smooth transitions are optional; creative contrast and varied blocks are valid DJ techniques.

## Memory and conversation scope

The current persistence is **preference memory, not conversation memory**:
- Only explicit preference statements (for example, “onthoud”, “vanaf nu” or “ik hou van”) are stored.
- The event profile retains at most 20 preference statements.
- Ordinary prompts are not stored as preferences.
- A ten-minute answer cache and an atomic eight-second request cooldown are separate operational mechanisms.

There is currently no persisted conversation transcript, session turn history, proposal registry or reliable reference resolution for follow-ups such as “maak die lijst commerciëler” or “vervang nummer vier”. Do not describe the assistant as learning from every prompt or remembering previous generated lists.

## Cost and security invariants

- Prefer the owner-operated local Claude Code bridge when configured; otherwise use the Cloudflare Workers AI binding.
- Do not introduce a paid API fallback or new paid provider without an explicit decision.
- Keep the Cloudflare Neuron budget guard, safety buffer, atomic cooldown, bounded prompts/output, timeout and answer cache.
- The local bridge must remain authenticated and must not expose credentials to browser code.
- Treat model output as untrusted advice. All Spotify actions remain behind the existing authenticated DJ application workflows.
- Keep Cloudflare bindings and concrete D1/provider wiring in the composition root.
- Keep the route thin and the assistant Spotify-independent.

## Focused next work

1. Add real conversation continuity only as a separate, bounded feature: persist DJ-authored turns and generated proposals, not Spotify catalogue or live queue data.
2. Give proposals stable IDs so the DJ can refer to a generated list or numbered item in later turns without replaying Spotify metadata into the model.
3. Keep any future action planner separate from the model; it must validate the DJ's explicit intent and call existing authenticated Spotify workflows.
4. Extend tests for conversation expiry, event/session isolation, proposal references, retention and prompt/data-boundary invariants before enabling conversational memory.
5. Preserve existing provider, budget, cooldown, cache and local-bridge behaviour while adding that capability.

## Related implementation

- `docs/architecture/ENGINEERING-STANDARD.md`
- `docs/architecture/API-INVENTORY.md`
- `docs/architecture/WORKER-RESPONSIBILITY-MAP.md`
- `docs/runbooks/PRODUCTION-READINESS.md`
