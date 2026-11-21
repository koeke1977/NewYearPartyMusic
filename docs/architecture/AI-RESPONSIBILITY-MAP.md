# AI responsibility map

**Snapshot:** AI-DJ action executor branch, based on `main` commit `c9b1f378ef58e24bbb41fe32705b7e4825bc39dd`; reviewed 2026-11-21.

## Current request flow

 `POST /api/dj/ai/assistant` authenticates the DJ session and validates the prompt (1–600 characters). Ordinary advice remains text-only. Explicit add/remove/reorder commands activate structured action planning; the Worker validates the JSON plan and executes only allow-listed PartyQueue workflows.

```text
routes/dj-ai.ts
  → platform/composition/ai-assistant.ts
      → modules/ai/application/execute-dj-assistant.ts
          → remember explicit DJ preference
          → load DJ-authored preference snapshot
          → load up to eight recent turns for the browser session
          → derive Belgian event-time moment
          → build bounded event, audience and PartyQueue context
          → build advice prompt or explicit action-plan contract
          → check answer cache (advice only) / cooldown / free-tier budget
          → local Claude Code bridge (when configured) or Cloudflare Workers AI
          → for action plans: validate intent + schema, then execute approved application use cases
          → report confirmed outcomes and persist the DJ prompt + final AI response
  scheduled/handler.ts
    → delete conversation turns older than seven days
```

The existing catalogue search, verified track insertion, queued-request moderation and queue reorder workflows are reused by the action executor. The model does not receive raw Spotify results or credentials: it proposes title/artist pairs, and the Worker performs Spotify search and exact-match verification before calling the existing add workflow.

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
| Structured DJ action plan parsing, explicit-intent guard and bounded execution | `modules/ai/application/execute-dj-assistant-actions.ts` |
| Cloudflare Workers AI invocation and provider response normalization | `integrations/ai/cloudflare-ai.ts` |
| Authenticated local Claude Code bridge protocol | `integrations/ai/local-ai-bridge.ts` |
| D1 preference snapshot reads | `modules/ai/infrastructure/assistant-context-repository.ts` |
| Event- and browser-session-scoped conversation reads/writes and seven-day retention | `modules/ai/infrastructure/assistant-conversation-repository.ts` |
| Explicit preference persistence, answer cache and atomic eight-second cooldown | `modules/ai/infrastructure/assistant-settings-repository.ts` |
| Daily Neuron usage persistence and budget calculation | `modules/ai/infrastructure/neuron-budget.ts` + `modules/ai/application/neuron-budget-policy.ts` |

## Data boundary and behaviour

The AI context contains:
- Event name and derived Belgian local event time.
- Explicit DJ-authored preferences persisted in the event profile.
- A bounded D1-backed PartyQueue snapshot: queued tracks in saved order, up to eight recently played tracks, request lifecycle counts, distinct requested-track count and top requested artists.
- Event-scoped aggregate guest preferences and eligible aggregate crowd feedback; no guest IDs or nicknames.
- The current DJ-authored question and up to eight prior DJ/AI conversation turns from the same browser session.

The D1 PartyQueue is the source of truth for this event's requested, planned (queued) and completed (played) tracks and saved order. Spotify UP NEXT is populated only from PartyQueue and is the downstream playback view of that same list, not an independent input or second signal. Never count it separately. Request counts represent demand, queued status represents the plan, played status represents completion, and crowd feedback is the separate response signal. The AI must not infer enjoyment from a request or played status. When event phase is supplied in `eventMoment.phase`, the prompt must use that value as the phase source and must not infer rehearsal, warm-up or another phase from clock time alone. The assistant must not claim that UP NEXT, planned tracks or played history are unavailable when their corresponding PartyQueue data is present in context. D1 status/timestamps are not independent Spotify player telemetry; do not claim live player state or catalogue verification unless explicitly supplied. The model receives the queue item IDs needed for safe remove/reorder proposals. No Spotify search tool or raw catalogue response is exposed to the model; the Worker searches Spotify and enforces exact normalized title-and-artist matching before an add. The assistant response retains an empty `spotifyMatches` array for browser compatibility; it is not a Spotify search result.

Track ideas in advice mode remain unverified suggestions. For explicit mutation commands only, the model returns a JSON action plan. The Worker requires matching user intent, validates bounded action shapes, verifies Spotify matches server-side, restricts removal to currently queued IDs and requires a complete queue for reordering. It executes through existing application use cases; it cannot alter settings or control playback.

The prompt deliberately permits sharp genre, decade and energy changes. Smooth transitions are optional; creative contrast and varied blocks are valid DJ techniques.

## Memory and conversation scope

The assistant now has two distinct forms of memory:
- **Preference memory:** only explicit preference statements (for example, “onthoud”, “vanaf nu” or “ik hou van”) are stored; the event profile retains at most 20 statements. Ordinary prompts do not become preferences.
- **Conversation memory:** a browser-generated UUID scopes the DJ/AI conversation. The Worker stores successful DJ prompts and AI-generated answers in D1, loads at most the last eight turns for the next prompt, and deletes turns older than seven days during scheduled cleanup. The endpoint remains compatible with older clients that omit a session ID; those requests receive a new server-generated session.

Conversation memory is deliberately limited to DJ-authored prompts and AI-generated answers. Spotify catalogue results and selected Spotify track metadata are not stored in the conversation table; the current PartyQueue snapshot is loaded separately into each bounded context. Mutating turns bypass the ten-minute answer cache. The atomic eight-second request cooldown remains in place.

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

1. Complete CI and browser validation for the structured action planner and executor.
2. Extend rehearsal coverage for multi-track exact-count requests, Spotify rate limits, ambiguous catalogue matches, queue changes during execution and partial failures.
3. Build the next adaptive DJ-direction phase with a bounded decision cadence and clear DJ override.
4. Preserve existing provider, budget, cooldown, advice-cache and local-bridge behaviour.

## Related implementation

- `docs/architecture/ENGINEERING-STANDARD.md`
- `docs/architecture/API-INVENTORY.md`
- `docs/architecture/WORKER-RESPONSIBILITY-MAP.md`
- `docs/runbooks/PRODUCTION-READINESS.md`


## Approved target direction — staged implementation

The product owner has approved evolving the assistant into an audience-aware AI-DJ. The current request flow above remains the actual implementation until later roadmap phases are delivered.

Target changes, in roadmap order:
- Central genre taxonomy with stable IDs; guest selections use these IDs.
- Event-scoped temporary guest preferences, with test/live isolation.
- Audience Intelligence based on aggregate genre selections, requests and crowd feedback. No durable per-nickname taste profile.
- Authenticated FLUSH to delete temporary event data while preserving application-wide taxonomy, DJ rules/prompts and Spotify OAuth connection.
- A structured AI decision planner with bounded event context and allow-listed actions.
- Worker-side validation and execution through existing application use cases. No direct model-to-D1 access.
- The AI may receive the minimum normalized catalogue/queue/audience context required for its decision, but never credentials or unrestricted provider access.
- PartyQueue D1 remains the source of truth for requested, queued and played state. In this event setup Spotify UP NEXT is its downstream view, not a separate data source.

The former blanket prohibition on bounded event context or model-invoked application actions is superseded by the approved direction in ENGINEERING-STANDARD.md and AI-DJ-ROADMAP.md. This does not authorize sending Spotify catalogue content to AI for classification or training. It is not permission to skip the staged implementation, tests, DJ authorization or production release approval.
