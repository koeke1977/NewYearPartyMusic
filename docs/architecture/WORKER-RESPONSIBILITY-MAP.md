# Worker responsibility map

**Snapshot:** `refactor/architecture-mainline`, based on current `main`; reviewed 2026-11-21.

## Composition and transport

| Owner | Current responsibility |
|---|---|
| `src/index.ts` | Hono composition root; mounts route groups, exports `QueueRoom`, delegates scheduled events and forwards unmatched requests to Assets |
| `routes/system.ts` | Public health and event configuration HTTP contracts |
| `routes/guest.ts` | Guest join, Spotify catalogue search and guest request submission |
| `routes/dj-auth.ts` | Shared event-scoped DJ session middleware |
| `routes/dj-identity.ts` | DJ login, Spotify connect initiation and OAuth callback |
| `routes/dj-ai.ts` | DJ-authenticated AI advice/action endpoint plus DJ-initiated Spotify search/add endpoints |
| `routes/dj-requests.ts` | DJ overview, queue reorder, moderation and settings |
| `routes/dj-playback.ts` | Spotify status, devices, NEXT, volume, transport commands and approved-request queueing |
| `scheduled/handler.ts` | Scheduled-event adapter; delegates completed-request cleanup, expired auth-attempt cleanup and AI conversation retention |
| `durable-objects/queue-room.ts` | Isolated Durable Object export; currently a health endpoint, not queue synchronization |

Routes own HTTP parsing, authentication, validation and response serialization. They do not own D1 query logic, provider wiring or business policy.

## Application and domain ownership

| Capability | Current owner | Boundary |
|---|---|---|
| DJ and guest sessions | `modules/identity/*` | Session-token policy, event binding and DJ login policy |
| Spotify OAuth policy | `modules/identity/spotify-oauth.ts` | Authorization URL, callback URI and scope policy |
| Guest and DJ request lifecycle | `modules/requests/application/guest-request-lifecycle.ts` | Join, submit, add, moderate and queue-approved workflows |
| DJ queue management | `modules/requests/application/dj-queue-management.ts` | Overview composition, queue ordering and setting validation |\n| AI-DJ action planning | `modules/ai/application/execute-dj-assistant-actions.ts` | Bounded JSON plan validation, explicit DJ-intent guard, Spotify exact-match add and queue remove/reorder orchestration |
| Request retention | `modules/requests/application/cleanup-completed-requests.ts` | 30-day completed/terminal request retention policy |
| Spotify catalogue search | `modules/music/application/search-spotify-tracks.ts` | Query validation and typed catalogue gateway use |
| Shared catalogue track | `modules/music/domain/catalog-track.ts` | Provider-independent normalized track DTO |
| Queue dispatch | `modules/queue/application/dispatch-next-track.ts` | Authoritative NEXT workflow and lease/side-effect sequencing |
| Playback automation | `modules/playback/application/playback-automation.ts` | Queue advancement and fallback eligibility/retry policy |
| Playback status | `modules/playback/application/get-dj-spotify-playback-status.ts` | Status orchestration while preserving polling side effects |
| DJ playback controls | `modules/playback/application/dj-playback-controls.ts` | Device listing, volume validation and transport-command policy |
| AI assistant | `modules/ai/application/execute-dj-assistant.ts` | Preference and conversation memory, prompt/context construction, cache, provider selection, budget, cooldown and stable result mapping |

## Infrastructure and provider ownership

- `platform/env.ts`: Cloudflare Worker binding contract.
- `platform/security/crypto.ts`: hashing, HMAC, base64url, constant-time comparison and encryption primitives.
- `modules/identity/session-token.ts`: provider-independent signed session-token policy.
- `modules/requests/infrastructure/*`: D1 persistence for guest requests, DJ queue, moderation and request retention.
- `modules/queue/infrastructure/*`: D1 queue-dispatch leases, ordered reads and conditional played transitions.
- `modules/playback/infrastructure/playback-policy-repository.ts`: fallback policy, retry/lease and manual-pause state.
- `modules/ai/infrastructure/assistant-context-repository.ts`: event-scoped DJ preference snapshot reads.
- `modules/ai/infrastructure/assistant-settings-repository.ts`: explicit preference persistence, answer cache and atomic eight-second cooldown.
- `modules/ai/infrastructure/assistant-conversation-repository.ts`: event/session-scoped DJ prompts and AI answers; seven-day retention.
- `modules/ai/infrastructure/neuron-budget.ts`: D1-backed daily Workers AI usage tracking.
- `integrations/ai/cloudflare-ai.ts`: Cloudflare Workers AI invocation and response normalization.
- `integrations/ai/local-ai-bridge.ts`: authenticated HTTPS bridge to the owner-operated Claude Code CLI.
- `integrations/spotify/catalog-token.ts` and `catalog-api.ts`: public catalogue client-credentials flow and Spotify catalogue protocol.
- `integrations/spotify/user-auth-service.ts` and `user-auth-repository.ts`: DJ OAuth token exchange, encryption lifecycle, refresh rotation and token persistence.
- `integrations/spotify/playback-api.ts`, `playback-control-gateway.ts` and `playback-status-gateway.ts`: Spotify playback protocol and response normalization.
- `platform/composition/*`: concrete Cloudflare bindings, repositories and provider adapters wired into application ports.

## AI trust and authority boundary

- The AI receives event name/time, explicit DJ-authored preferences, the DJ's current prompt and a bounded history of prior DJ prompts plus AI-generated answers.
- The AI receives no Spotify catalogue results, Spotify track/artist metadata, album art, playback state, live queue, guest requests, request counts or Spotify-derived metrics.
- The conversation repository stores only DJ prompts and AI-generated answers. Spotify search results and selected Spotify tracks are not persisted as conversation context.
- The AI has no Spotify search tool, DJ OAuth token or direct D1 binding.
- AI suggestions are unverified general-knowledge ideas. Spotify lookup happens separately through an authenticated DJ action after the AI response.
- AI cannot add tracks, reorder or moderate requests, change settings or control Spotify playback. The DJ explicitly selects tracks and invokes the existing authenticated workflows.
- No paid API fallback is configured. Preserve the local bridge authentication, Cloudflare Neuron budget guard, safety buffer, timeout, cache and cooldown.

## Behaviour and security invariants

- Preserve every existing HTTP method/path, payload, response shape, status code and authentication boundary.
- Keep Spotify catalogue client-credentials and DJ OAuth user-token flows separate.
- Preserve encrypted token format, refresh leases, invalidation and owner checks.
- Preserve queue dispatch lease expiry, ordering and only-mark-played-after-Spotify-success semantics.
- Preserve playback polling auto-advance/fallback behaviour; `GET /api/dj/spotify/status` is not side-effect-free.
- Preserve event scoping, unlimited active requests per guest, the rolling 20-per-60-minute request limit, duplicate checks, moderation transitions and 30-day terminal-request cleanup.
- Guest join and DJ login use atomic D1 per-IP attempt buckets; only HMAC-hashed IP identifiers are stored.
- Application/domain modules must not import Hono, Cloudflare, D1 repositories or provider implementations. The architecture-boundary check enforces the current dependency rules.
- Production Worker, D1, hostname and OAuth credentials are live event infrastructure. Do not reset, migrate destructively, repoint or deploy production resources as part of routine refactoring.

## Remaining focused work

1. Continue replacing HTTP-shaped application outcomes with typed outcomes only where a concrete boundary improves correctness; preserve external API contracts.
2. Before production enablement, review migration 0004 and plan post-release smoke tests for session/event isolation, seven-day retention and Spotify-data exclusion; local migration and CI coverage are already green.
3. Keep browser and Worker changes small, testable and tied to real behaviour. Do not create speculative services or modules.
