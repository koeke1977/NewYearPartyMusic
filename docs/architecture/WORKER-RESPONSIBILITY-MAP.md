# Worker responsibility map

**Snapshot:** `refactor/architecture-foundation`, reviewed 2026-11-20. This document describes the implementation that exists now; it is not a list of historical extraction tasks.

## Composition and transport

| Owner | Current responsibility |
|---|---|
| `src/index.ts` | Worker composition root: creates the Hono app, mounts route groups, exports `QueueRoom`, delegates scheduled events and forwards unmatched requests to Assets |
| `routes/system.ts` | Public health and event configuration HTTP contracts |
| `routes/guest.ts` | Guest join, guest catalogue search and request submission transport |
| `routes/dj-auth.ts` | Shared event-scoped DJ session middleware |
| `routes/dj-identity.ts` | DJ login transport, Spotify connect initiation, OAuth callback state-cookie validation and redirects |
| `routes/dj-ai.ts` | DJ assistant and AI music search/add HTTP contracts |
| `routes/dj-requests.ts` | DJ overview, queue reorder, request moderation and settings HTTP contracts |
| `routes/dj-playback.ts` | Spotify status, devices, NEXT, volume, transport commands and approved-request queueing HTTP contracts |
| `scheduled/handler.ts` | Cloudflare scheduled-event adapter; delegates completed-request cleanup |
| `durable-objects/queue-room.ts` | Isolated Durable Object export. Currently a health endpoint only; it is not the queue transport or synchronization mechanism |

The route handlers are substantially thinner than the original Worker entrypoint. DJ request, DJ playback and DJ identity provider wiring now live behind focused composition adapters. Routes retain HTTP parsing, authentication/middleware application, OAuth state-cookie handling and response serialization; they must not own business policy, D1 repository construction or Spotify provider wiring.

## Application and domain ownership

| Capability | Current owner | Boundary |
|---|---|---|
| DJ and guest sessions | `modules/identity/*` | Session-token policy, event binding and DJ login policy; token cryptography is injected through an application-owned port |
| Spotify OAuth policy | `modules/identity/spotify-oauth.ts` | Pure authorization URL, callback URI and scope policy; code exchange is provided by the platform composition adapter |
| Guest and DJ request lifecycle | `modules/requests/application/guest-request-lifecycle.ts` | Join, submit, add, moderate and queue-approved workflows |
| DJ queue management | `modules/requests/application/dj-queue-management.ts` | Overview composition, queue ordering and setting validation |
| Request retention | `modules/requests/application/cleanup-completed-requests.ts` | 30-day completed/terminal request cleanup policy |
| Spotify catalogue search | `modules/music/application/search-spotify-tracks.ts` | Query validation and guest/DJ search behaviour through `SpotifyCatalogSearchGateway` |
| Shared catalogue track | `modules/music/domain/catalog-track.ts` | Provider-independent normalized track DTO shared by music and request workflows |
| Queue dispatch | `modules/queue/application/dispatch-next-track.ts` | Authoritative NEXT workflow and lease/side-effect sequencing |
| Playback automation | `modules/playback/application/playback-automation.ts` | Queue advancement and fallback eligibility/retry policy |
| Playback status | `modules/playback/application/get-dj-spotify-playback-status.ts` | Status result orchestration while preserving existing polling side effects |
| DJ playback controls | `modules/playback/application/dj-playback-controls.ts` | Device listing, volume validation and transport-command policy |
| AI assistant | `modules/ai/application/execute-dj-assistant.ts` | End-to-end assistant use case: preference memory, context, prompt, cache, budget, cooldown, orchestration and result/error mapping |

## Infrastructure and provider ownership

- `platform/env.ts`: Cloudflare Worker binding contract.
- `platform/security/crypto.ts`: hashing, HMAC, base64url and constant-time comparison; token encryption primitives.
- `modules/identity/session-token.ts`: pure signed session-token policy; consumes an injected cryptographic port.
- `platform/composition/session-token.ts`: binds session-token policy to the platform HMAC/base64url primitives.
- `modules/requests/infrastructure/guest-request-d1-repository.ts`: D1 implementation of the guest/request repository port.
- `modules/requests/infrastructure/guest-request-repository.ts`: D1 query implementation, including the atomic rolling 60-minute guest request quota (20 per guest), conflict-safe active-track insertion, conditional moderation transitions and atomic queue-order append.
- `db/schema.sql`: partial unique index `idx_requests_one_active_track` enforces one active request per Spotify track per event; terminal states release the key.
- `modules/requests/application/guest-request-lifecycle.ts`: consumes the shared normalized `CatalogTrack` DTO and a typed track-lookup port; it does not parse Spotify wire data.
- `modules/requests/infrastructure/dj-queue-d1-repository.ts`: DJ overview, saved queue order and settings persistence.
- `modules/requests/infrastructure/request-retention-repository.ts`: completed-request retention persistence.
- `modules/queue/infrastructure/queue-dispatch-d1-repository.ts`: D1 lease, ordered queue reads, conditional played transition and playback-state writes.
- `modules/playback/infrastructure/playback-policy-repository.ts`: fallback policy state, retry/lease state and manual-pause persistence.
- `modules/ai/infrastructure/assistant-context-repository.ts`, `assistant-settings-repository.ts` and `neuron-budget.ts`: bounded context reads, preference/cache/cooldown persistence and daily usage tracking.
- `integrations/spotify/catalog-token.ts`, `catalog-api.ts`: public catalogue client-credentials flow, Spotify search/single-track wire parsing and typed catalogue gateway implementations.
- `integrations/spotify/playback-control-gateway.ts`: Spotify device, volume and transport HTTP response normalization into the application-owned playback-control port.
- `integrations/spotify/user-auth-service.ts` and `user-auth-repository.ts`: DJ OAuth token exchange, encryption lifecycle, refresh rotation, authenticated API calls and token persistence.
- `integrations/spotify/playback-api.ts`: Spotify playback endpoint paths, methods and payloads.
- `modules/playback/application/playback-ports.ts`: typed playback status and control gateway contracts; playback control use cases no longer consume Fetch `Response` objects.
- `integrations/spotify/playback-status-gateway.ts`: Spotify playback wire-response parsing and normalization into the application-owned typed gateway contract.
- `integrations/ai/cloudflare-ai.ts`: Cloudflare Workers AI invocation and response/tool-call normalization.
- `integrations/ai/spotify-catalog-search.ts`: bounded, read-only Spotify catalogue search tool exposed to the assistant.

## Composition adapters

Concrete Cloudflare bindings and provider/repository implementations are currently wired in:

- `platform/composition/guest-workflows.ts`: guest join/request, guest/DJ catalogue search and DJ AI track insertion.
- `platform/composition/ai-assistant.ts`: AI application ports, D1 repositories, Cloudflare AI binding and read-only Spotify search.
- `platform/composition/dj-playback-workflows.ts`: queue dispatch, playback status, DJ controls, Spotify calls and playback automation/repository wiring.
- `platform/composition/dj-request-workflows.ts`: D1 repository wiring for DJ overview, queue ordering, moderation, settings and approved-request queueing.
- `platform/composition/dj-identity-workflows.ts`: DJ login policy wired to platform hashing and signed-token services.
- `platform/composition/spotify-oauth.ts`: OAuth authorization-code exchange wired to encrypted Spotify token persistence.
- `platform/composition/session-token.ts`: platform crypto adapter for signed session-token creation and validation.

These are infrastructure composition adapters, not domain/application modules.

## AI trust and authority boundary

- AI receives bounded event/queue context and can use only the explicitly exposed, read-only Spotify catalogue search.
- The AI provider does not receive the Spotify DJ OAuth token or direct D1 binding.
- AI output is untrusted and normalized before it is returned.
- AI cannot mutate requests, reorder the queue, change settings or control Spotify playback.
- Track additions and queue reorder remain explicit DJ-initiated actions; queue reorder proposals are validated as a complete permutation before the DJ confirmation callback can save them.
- The free-tier Neuron budget ceiling, safety buffer and cooldown remain enforced by application/infrastructure policy. No paid fallback provider is configured.

## Verified remaining architecture work

1. **Playback status intentionally has side effects.** `GET /api/dj/spotify/status` may advance PartyQueue or start fallback playback. This is existing application behaviour, now behind a typed Spotify playback gateway. Preserve and characterize these side effects; do not silently make the endpoint read-only.
2. **Dependency boundaries are now enforced in CI.** `npm run test:architecture` scans Worker application/domain/identity modules and browser JS/HTML. It rejects direct Worker infrastructure/provider/platform/route dependencies and D1/Fetch Response usage, and enforces browser API-client ownership for fetch, session ownership for localStorage, no direct Spotify API calls and no inline HTML styles/scripts/handlers. Extend coverage only when a stable rule exists; do not create brittle path whitelists.
3. **Public code-entry endpoints need edge throttling before a real event.** `/api/guests/join` and `/api/dj/login` have no application-level attempt throttle and no configured Cloudflare rate-limiting binding. Configure and verify Cloudflare edge limits before exposing the event publicly.
4. **Some application use cases still return HTTP-shaped `{ status, body }` results.** Queue reorder and DJ settings now return typed `QueueManagementOutcome` values; `routes/dj-requests.ts` owns the HTTP status/body mapping. Guest request lifecycle, AI assistant, catalogue search and playback use cases still need the same treatment, preserving the existing external API contract.

## Behaviour and safety invariants

- Preserve every existing HTTP method/path, payload, response shape, status code and authentication boundary.
- Keep catalogue client-credentials and DJ OAuth user-token flows separate.
- Preserve encrypted token format, refresh leases, invalidation and owner checks.
- Preserve queue dispatch lease expiry, ordering and only-mark-played-after-Spotify-success semantics.
- Preserve playback polling auto-advance/fallback behaviour.
- Preserve D1 event scoping, the unlimited-active-request policy, the rolling 20-per-60-minute guest quota, duplicate checks, request transitions and 30-day cleanup rules.
- Guest requests have no per-guest open/active queue cap. A rolling 60-minute limit of 20 requests per guest is rechecked in the same D1 `INSERT ... SELECT` statement that inserts the request; concurrent submissions cannot exceed the quota.
- DJ queue-order append is a single SQLite JSON upsert using `json_each`/`json_insert`, avoiding read-modify-write lost updates when multiple tracks are added concurrently.
- Guest session signing completes before the guest row is persisted, preventing orphan guest records if signing fails.
- Active-track uniqueness is enforced by a partial unique index over `(event_id, spotify_track_id)` for `pending`, `approved` and `queued`; both guest and DJ insert paths use conflict-safe inserts.
- DJ moderation transitions use a conditional `UPDATE ... WHERE status IN (...)`; stale concurrent actions return the existing conflict response rather than overwriting a newer state.
- The current Cloudflare Worker, D1 and Spotify OAuth connection are test-only. Test rows/tokens are disposable and may be reset or recreated during architecture work. Keep secrets protected and never commit them.

## Validation status

GitHub Actions run [44779098131](https://github.com/koeke1977/NewYearPartyMusic/actions/runs/44779098131) passed on current head `7d7deab2019a6558975396f2b2837d9ae623e08e`:

- TypeScript validation.
- Worker and browser architecture-boundary checks.
- All unit and security tests, including concurrency regressions and typed queue-management outcomes.
- Cloudflare Worker bundle dry-run.
- Guest and DJ browser journeys.
- Desktop/responsive screenshot baseline capture and artifact upload.

The current Cloudflare Worker, D1 and Spotify OAuth connection remain test-only and disposable; no real-event release or external deployment was performed.

## Follow-up: Spotify catalogue and playback-control ports — 2026-11-20

- Introduced an application-owned `CatalogTrack` DTO and `SpotifyCatalogSearchGateway`. Guest and DJ catalogue use cases now depend on typed results rather than Spotify wire DTOs or Fetch `Response` objects.
- Added Spotify response normalization to the catalogue integration adapter, including validation of required track fields and typed handling of rate limits/provider errors.
- Introduced `SpotifyPlaybackControlGateway` for device discovery, volume and transport commands. The playback application maps typed results to the existing API response contract; Spotify HTTP status/body parsing remains in the integration adapter.
- Preserved guest/DJ search payloads, query limits, rate-limit responses, device JSON field names, volume validation, transport command behaviour and bounded error detail.
- Added use-case and integration tests for success, provider failures, malformed catalogue payloads, 204 playback success and error-detail bounds.
- Full validation passed in run [44774538622](https://github.com/koeke1977/NewYearPartyMusic/actions/runs/44774538622).


### Follow-up: normalized individual Spotify track lookup — 2026-11-20

- Added `modules/music/domain/catalog-track.ts` as the provider-independent track DTO shared by catalogue search and request creation.
- The Spotify integration now normalizes both catalogue search results and individual track lookups, including required-field validation and album-image selection.
- Guest request and DJ-added-track workflows receive the same typed DTO. `platform/composition/guest-workflows.ts` no longer parses Spotify JSON or passes Fetch `Response` objects into application workflows.
- Preserved not-found behaviour, error mapping, artist order, album-image selection and request persistence payloads.


## Follow-up: D1 request concurrency invariants — 2026-11-20

- Added the partial unique index `idx_requests_one_active_track` on `(event_id, spotify_track_id)` for active request states `pending`, `approved` and `queued`.
- Request insertion uses `INSERT OR IGNORE` and returns whether D1 inserted the row. Guest requests map a concurrent duplicate to HTTP 409; DJ additions return `alreadyQueued` and do not append a duplicate queue-order entry.
- Guest requests have no per-guest open/active queue cap. The rolling 20-per-60-minute quota is checked in the same D1 `INSERT ... SELECT` statement, so concurrent submissions cannot exceed it.
- Moderation writes include the expected previous status in the SQL predicate. If another action wins first, the stale action returns HTTP 409 and cannot overwrite the new status.
- DJ queue-order append is an atomic SQLite JSON upsert, so concurrent track additions cannot overwrite one another's saved order.
- Guest session signing now happens before guest persistence, avoiding orphan guest rows when signing fails.
- Terminal states (`played`, `rejected`, `failed`) release the unique active-track key, so the track can be requested again later.
- Regression tests cover guest/DJ duplicate-insert races, guest quota races, stale moderation updates, atomic queue-order SQL and session-signing failure. Complete CI run [44778527531](https://github.com/koeke1977/NewYearPartyMusic/actions/runs/44778527531) passed all checks and browser baselines.


## Follow-up: application outcomes for DJ queue management — 2026-11-20

- `reorderDjQueue` and `updateDjSetting` no longer return HTTP status codes or serialized response bodies from the application layer.
- They return a discriminated `QueueManagementOutcome<T>` with typed error codes and application messages.
- `routes/dj-requests.ts` now maps those outcomes to the unchanged HTTP statuses and response JSON.
- Regression tests assert the application outcomes. Full CI run [44779098131](https://github.com/koeke1977/NewYearPartyMusic/actions/runs/44779098131) passed all checks and browser baselines.
