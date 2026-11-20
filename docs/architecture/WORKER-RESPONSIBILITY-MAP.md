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
| Spotify catalogue search | `modules/music/application/search-spotify-tracks.ts` | Query validation, application DTOs and guest/DJ search behaviour through `SpotifyCatalogSearchGateway` |
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
- `modules/requests/infrastructure/dj-queue-d1-repository.ts`: DJ overview, saved queue order and settings persistence.
- `modules/requests/infrastructure/request-retention-repository.ts`: completed-request retention persistence.
- `modules/queue/infrastructure/queue-dispatch-d1-repository.ts`: D1 lease, ordered queue reads, conditional played transition and playback-state writes.
- `modules/playback/infrastructure/playback-policy-repository.ts`: fallback policy state, retry/lease state and manual-pause persistence.
- `modules/ai/infrastructure/assistant-context-repository.ts`, `assistant-settings-repository.ts` and `neuron-budget.ts`: bounded context reads, preference/cache/cooldown persistence and daily usage tracking.
- `integrations/spotify/catalog-token.ts`, `catalog-api.ts`: public catalogue client-credentials flow, Spotify wire parsing and typed catalogue gateway implementation.
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

1. **Playback status remains a compatibility seam.** `GET /api/dj/spotify/status` may advance PartyQueue or start fallback playback. Preserve and test these existing side effects; do not silently turn the endpoint into a read-only operation.
2. **Automated dependency-boundary enforcement is not yet present.** Add checks only after module ownership/ports are stable; avoid brittle rules that simply whitelist today's violations.
3. **Public code-entry endpoints need edge throttling before go-live.** `/api/guests/join` and `/api/dj/login` have no application-level attempt throttle and no configured Cloudflare rate-limiting binding. Configure and verify Cloudflare edge limits for both routes before exposing the event publicly.

## Behaviour and safety invariants

- Preserve every existing HTTP method/path, payload, response shape, status code and authentication boundary.
- Keep catalogue client-credentials and DJ OAuth user-token flows separate.
- Preserve encrypted token format, refresh leases, invalidation and owner checks.
- Preserve queue dispatch lease expiry, ordering and only-mark-played-after-Spotify-success semantics.
- Preserve playback polling auto-advance/fallback behaviour.
- Preserve D1 event scoping, guest rate limits, duplicate checks, request transitions and 30-day cleanup rules.
- The current Cloudflare Worker, D1 and Spotify OAuth connection are test-only. Test rows/tokens are disposable and may be reset or recreated during architecture work. Keep secrets protected and never commit them.

## Validation status

GitHub Actions run [44769018405](https://github.com/koeke1977/NewYearPartyMusic/actions/runs/44769018405) passed on head `8247bc1d0d7651f31e805d8f01827237ddec103b`:

- TypeScript validation.
- Security characterization tests.
- Cloudflare Worker bundle dry-run.
- Guest and DJ browser journeys.
- Desktop/responsive screenshot baseline capture.

The screenshot artifact `partyqueue-ui-baseline` was uploaded successfully. This validates the current behaviour and tests; the architecture work below remains open. The current deployed Cloudflare resources are test-only, not a live production service.

## Follow-up: Spotify catalogue and playback-control ports — 2026-11-20

- Introduced an application-owned `CatalogTrack` DTO and `SpotifyCatalogSearchGateway`. Guest and DJ catalogue use cases now depend on typed results rather than Spotify wire DTOs or Fetch `Response` objects.
- Added Spotify response normalization to the catalogue integration adapter, including validation of required track fields and typed handling of rate limits/provider errors.
- Introduced `SpotifyPlaybackControlGateway` for device discovery, volume and transport commands. The playback application maps typed results to the existing API response contract; Spotify HTTP status/body parsing remains in the integration adapter.
- Preserved guest/DJ search payloads, query limits, rate-limit responses, device JSON field names, volume validation, transport command behaviour and bounded error detail.
- Added use-case and integration tests for success, provider failures, malformed catalogue payloads, 204 playback success and error-detail bounds.
- Current-head CI is running; update this section with the exact result after it completes.
