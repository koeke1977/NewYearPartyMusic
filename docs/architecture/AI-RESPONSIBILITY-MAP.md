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
          → load up to eight recent turns for the browser session
          → derive Belgian event-time moment
          → build context and prompt
          → check answer cache / cooldown / free-tier budget
          → local Claude Code bridge (when configured)
            or Cloudflare Workers AI
          → persist successful DJ prompt + AI answer pair
  scheduled/handler.ts
    → delete conversation turns older than seven days
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
| Event- and browser-session-scoped conversation reads/writes and seven-day retention | `modules/ai/infrastructure/assistant-conversation-repository.ts` |
| Explicit preference persistence, answer cache and atomic eight-second cooldown | `modules/ai/infrastructure/assistant-settings-repository.ts` |
| Daily Neuron usage persistence and budget calculation | `modules/ai/infrastructure/neuron-budget.ts` + `modules/ai/application/neuron-budget-policy.ts` |

## Data boundary and behaviour

The AI context contains only:
- Event name and derived Belgian local event time.
- Explicit DJ-authored preferences persisted in the event profile.
- The current DJ-authored question and up to eight prior DJ/AI conversation turns from the same browser session.

The AI receives **no** Spotify catalogue results, track or artist metadata, album art, playback state, live queue, guest requests, request counts, saved queue order, accepted-set history or Spotify-derived usage metrics. No Spotify search tool is registered with the model. The assistant response returns an empty `spotifyMatches` array for compatibility; it is not a Spotify search result.

Track ideas are unverified suggestions based on general model knowledge. The DJ must search for them separately using the normal Spotify catalogue endpoint and explicitly choose any action. The model cannot add tracks, reorder or moderate requests, alter settings, or control playback.

The prompt deliberately permits sharp genre, decade and energy changes. Smooth transitions are optional; creative contrast and varied blocks are valid DJ techniques.

## Memory and conversation scope

The assistant now has two distinct forms of memory:
- **Preference memory:** only explicit preference statements (for example, “onthoud”, “vanaf nu” or “ik hou van”) are stored; the event profile retains at most 20 statements. Ordinary prompts do not become preferences.
- **Conversation memory:** a browser-generated UUID scopes the DJ/AI conversation. The Worker stores successful DJ prompts and AI-generated answers in D1, loads at most the last eight turns for the next prompt, and deletes turns older than seven days during scheduled cleanup. The endpoint remains compatible with older clients that omit a session ID; those requests receive a new server-generated session.

Conversation memory is deliberately limited to DJ-authored prompts and AI-generated answers. Spotify catalogue results, selected Spotify tracks, playback state and live queue data are not stored in the conversation table or sent back to the model. A ten-minute answer cache and an atomic eight-second request cooldown remain separate operational mechanisms.

The assistant can now resolve follow-ups such as “maak die lijst commerciëler” or “vervang nummer vier” within the retained session. It does not have a separate proposal registry or durable structured track IDs; generated suggestions remain ordinary AI text until the DJ searches Spotify separately.

## Cost and security invariants

- Prefer the owner-operated local Claude Code bridge when configured; otherwise use the Cloudflare Workers AI binding.
- Do not introduce a paid API fallback or new paid provider without an explicit decision.
- Keep the Cloudflare Neuron budget guard, safety buffer, atomic cooldown, bounded prompts/output, timeout and answer cache.
- The local bridge must remain authenticated and must not expose credentials to browser code.
- Treat model output as untrusted advice. All Spotify actions remain behind the existing authenticated DJ application workflows.
- Keep Cloudflare bindings and concrete D1/provider wiring in the composition root.
- Keep the route thin and the assistant Spotify-independent.

## Focused next work

1. Consider a structured proposal registry only if plain-text conversation history proves insufficient for reliable list/item references.
2. Keep any future action planner separate from the model; it must validate the DJ's explicit intent and call existing authenticated Spotify workflows.
3. Extend tests for retention, event/session isolation and prompt/data-boundary invariants as the feature evolves.
4. Preserve existing provider, budget, cooldown, cache and local-bridge behaviour.

## Related implementation

- `docs/architecture/ENGINEERING-STANDARD.md`
- `docs/architecture/API-INVENTORY.md`
- `docs/architecture/WORKER-RESPONSIBILITY-MAP.md`
- `docs/runbooks/PRODUCTION-READINESS.md`


## Approved target direction — implementation pending

The product owner has approved evolving the assistant into an audience-aware AI-DJ. The current request flow above remains the actual implementation until later roadmap phases are delivered.

Target changes, in roadmap order:
- Central genre taxonomy with stable IDs; guest selections use these IDs.
- Event-scoped temporary guest preferences, with test/live isolation.
- Audience Intelligence based on aggregate genre selections, requests and crowd feedback. No durable per-nickname taste profile.
- Authenticated FLUSH to delete temporary event data while preserving application-wide taxonomy, DJ rules/prompts and Spotify OAuth connection.
- A structured AI decision planner with bounded event context and allow-listed actions.
- Worker-side validation and execution through existing application use cases. No direct model-to-D1 access.
- The AI may receive the minimum normalized catalogue/queue/audience context required for its decision, but never credentials or unrestricted provider access.
- PartyQueue D1 remains the source of truth for the PartyQueue queue; Spotify UP NEXT remains separate.

The former blanket prohibition on any Spotify-derived context or model-invoked action is superseded by the approved direction in ENGINEERING-STANDARD.md and AI-DJ-ROADMAP.md. It is not permission to skip the staged implementation, tests, DJ authorization or production release approval.
