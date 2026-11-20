# Worker responsibility map

This map is based on the current `apps/worker/src/index.ts` after the first extraction. It distinguishes code that has already moved from code that still needs a dedicated owner.

## Already extracted

| Current responsibility | Current module | Target owner |
|---|---|---|
| Worker binding contract | `platform/env.ts` | `platform/env.ts` |
| SHA-256, HMAC, base64url, constant-time comparison | `platform/security/crypto.ts` | `platform/security/crypto.ts` |
| AES-GCM encryption/decryption for stored Spotify tokens | `platform/security/crypto.ts` | `platform/security/crypto.ts` |
| Signed bearer-token creation and validation | `modules/identity/session-token.ts` | `modules/identity/` |
| DJ login validation and event-scoped DJ session authorization | `modules/identity/dj-session.ts` | `modules/identity/dj-session.ts` |
| Spotify authorization URL/scope construction and authorization-code completion use case | `modules/identity/spotify-oauth.ts` | `modules/identity/spotify-oauth.ts` + `integrations/spotify/user-auth-service.ts` |
| Spotify client-credentials token cache | `integrations/spotify/catalog-token.ts` | `integrations/spotify/catalog-token.ts` |
| Spotify track response shape | `integrations/spotify/types.ts` | `integrations/spotify/types.ts` |
| Spotify playback HTTP endpoints, methods and request payloads | `integrations/spotify/playback-api.ts` | `integrations/spotify/playback-api.ts` |
| Guest and DJ Spotify catalogue search validation, result mapping and error semantics | `modules/music/application/search-spotify-tracks.ts` | Same music application module |
| Encrypted Spotify user-token persistence, refresh lease and invalidation | `integrations/spotify/user-auth-repository.ts` | `integrations/spotify/user-auth-repository.ts` |
| Spotify OAuth code exchange, encrypted token lifecycle, refresh rotation and authenticated user API client | `integrations/spotify/user-auth-service.ts` | `integrations/spotify/user-auth-service.ts` |
| Queue dispatch D1 lease, ordered queue read, conditional played transition and playback-state writes | `modules/queue/infrastructure/queue-dispatch-repository.ts` | `modules/queue/infrastructure/queue-dispatch-repository.ts` |
| Cohesive lock-protected PartyQueue dispatch workflow | `modules/queue/application/dispatch-next-track.ts` | `modules/queue/application/dispatch-next-track.ts` |
| DJ overview, queue ordering and settings D1 access | `modules/requests/infrastructure/dj-queue-repository.ts` | `modules/requests/infrastructure/dj-queue-repository.ts` |
| DJ overview composition, queue reorder and setting validation | `modules/requests/application/dj-queue-management.ts` | `modules/requests/application/dj-queue-management.ts` |
| Completed-request 30-day retention policy and deletion | `modules/requests/application/cleanup-completed-requests.ts` + `request-retention-repository.ts` | Same application/repository boundary |
| Queue end-of-track advancement and fallback eligibility/retry policy | `modules/playback/application/playback-automation.ts` | `modules/playback/application/playback-automation.ts` + `modules/playback/infrastructure/playback-policy-repository.ts` |
| DJ Spotify status orchestration, response mapping and fallback queue preview | `modules/playback/application/get-dj-spotify-playback-status.ts` | Same playback application module |
| DJ Spotify device listing, volume validation and transport-command/manual-pause orchestration | `modules/playback/application/dj-playback-controls.ts` | Same playback application module |
| Playback policy settings, fallback leases/errors/retry state and manual-pause persistence | `modules/playback/infrastructure/playback-policy-repository.ts` | Same repository |
| Spotify playback HTTP route state reads/writes | Thin adapters calling playback repository functions | `modules/playback/infrastructure/playback-policy-repository.ts` |

## Extracted platform components

- `durable-objects/queue-room.ts`: isolated Cloudflare Durable Object export. The Worker composition root re-exports `QueueRoom` so the Wrangler binding name remains unchanged.

## Extracted HTTP route modules

| Route group | Module | Responsibility |
|---|---|---|
| Guest join, guest Spotify search and guest request submission | `routes/guest.ts` | Parse guest HTTP input, enforce event-scoped guest sessions, call request/music use cases and serialize their existing responses |

Guest route tests verify unauthenticated search/request rejection and malformed join JSON handling without invoking D1 or Spotify.

## Remaining entrypoint responsibilities

| Current function / route | Current mixed responsibility | Intended owner |
|---|---|---|
| `requireDJ` | Thin event-scoped DJ session authorization adapter | `modules/identity/dj-session.ts` |
| `POST /api/guests/join` | HTTP body parsing and response serialization | `routes/guest.ts` → request lifecycle + identity session-token service |
| `GET /api/spotify/search` | Guest authorization, query extraction and response serialization | `routes/guest.ts` → music search use case + Spotify catalogue adapter |
| `POST /api/requests` | Guest session authorization, input validation and response serialization | `routes/guest.ts` → request lifecycle + Spotify catalogue adapter |
| `POST /api/dj/login` | JSON parsing and response serialization | `modules/identity/dj-session.ts` |
| `POST /api/dj/ai/assistant` | Preference persistence, history/context assembly, event-time logic, prompt construction, provider call, tool dispatch, cache, quota/error mapping | AI orchestrator + context assembler + memory repository + prompt catalog + Cloudflare AI provider + Spotify search tool |
| `POST /api/dj/ai/music/search` | DJ authorization, JSON parsing and response serialization | `modules/music/application/search-spotify-tracks.ts` + Spotify catalogue adapter |
| `POST /api/dj/ai/music/add` | DJ authorization, input validation and response serialization | `modules/requests/application/guest-request-lifecycle.ts` + `modules/requests/infrastructure/guest-request-repository.ts` + Spotify catalogue adapter |
| `GET /api/dj/overview` | DJ authorization and response serialization | `modules/requests/application/dj-queue-management.ts` + `dj-queue-repository.ts` |
| `POST /api/dj/queue/reorder` | DJ authorization, JSON parsing and response serialization | `modules/requests/application/dj-queue-management.ts` + `dj-queue-repository.ts` |
| `POST /api/dj/requests/:id/:action` | DJ authorization, action parameter and response serialization | `modules/requests/application/guest-request-lifecycle.ts` + `modules/requests/infrastructure/guest-request-repository.ts` |
| `POST /api/dj/settings/:key` | DJ authorization, JSON parsing and response serialization | `modules/requests/application/dj-queue-management.ts` + `dj-queue-repository.ts` |
| `saveSpotifyTokens` | Encrypt token pair, then delegate persistence | `integrations/spotify/user-auth-service.ts` + token repository |
| `spotifyUserToken` | Refresh-token flow, decrypt, refresh request and rotation; D1 operations delegated | `integrations/spotify/user-auth-service.ts` + `user-auth-repository.ts` |
| `spotifyFetch` | Authenticated Spotify user API request and 401 refresh retry; token invalidation delegated | `integrations/spotify/user-auth-service.ts` + `user-auth-repository.ts` |
| `POST /api/dj/spotify/connect` | DJ auth, OAuth state creation and cookie | `modules/identity/spotify-oauth.ts` + route adapter |
| `GET /auth/spotify/callback` | State cookie validation, response redirects and cookie clearing | `modules/identity/spotify-oauth.ts` + `integrations/spotify/user-auth-service.ts` + route adapter |
| `startSpotifyFallback` | Spotify playback gateway calls plus application/repository delegation | Playback application service + `modules/playback/infrastructure/playback-policy-repository.ts` + `integrations/spotify/playback-api.ts` |
| `startNextPartyQueueRequest` | Thin adapter supplying the Spotify playback operation | `modules/queue/application/dispatch-next-track.ts` + `modules/queue/infrastructure/queue-dispatch-repository.ts` |
| `maybeAdvancePartyQueue` | Thin adapter to queue advancement policy | `modules/playback/application/playback-automation.ts` |
| `maybeStartSpotifyFallback` | Thin adapter to fallback eligibility/retry policy | `modules/playback/application/playback-automation.ts` |
| `GET /api/dj/spotify/status` | DJ authorization and HTTP response serialization | `modules/playback/application/get-dj-spotify-playback-status.ts` + playback policy + Spotify playback adapter |
| `GET /api/dj/spotify/devices` | DJ authorization and HTTP response serialization | `modules/playback/application/dj-playback-controls.ts` + Spotify playback adapter |
| `POST /api/dj/spotify/next-request` | DJ auth and queue dispatch | Dispatch-next-track use case |
| `PUT /api/dj/spotify/volume` | DJ authorization, JSON parsing and response serialization | `modules/playback/application/dj-playback-controls.ts` + Spotify playback adapter |
| `POST /api/dj/spotify/:action` | DJ authorization and response serialization | `modules/playback/application/dj-playback-controls.ts` + playback policy repository + Spotify playback adapter |
| `POST /api/dj/spotify/queue/:id` | DJ authorization and response serialization | `modules/requests/application/guest-request-lifecycle.ts` + conditional request repository update |
| Scheduled request cleanup | Worker scheduled-event adapter | `modules/requests/application/cleanup-completed-requests.ts` + `request-retention-repository.ts` |
| `QueueRoom` | `durable-objects/queue-room.ts` | Isolated Durable Object health endpoint; keep minimal until a real coordination requirement exists |
| `app.notFound` and default export | Static asset fallback, Worker fetch and scheduled composition | HTTP app composition + Worker composition root |

## Architectural hotspots to address first

1. **Spotify identity separation:** catalogue client-credentials token and DJ OAuth user token are separate credentials and must stay separate modules.
2. **Playback status side effects:** `GET /api/dj/spotify/status` currently advances PartyQueue and can start the fallback playlist. This behaviour must be preserved in characterization tests before deciding whether to redesign the endpoint.
3. **Queue dispatch consistency:** the D1 lock, Spotify play call, request status transition and lock release form one critical workflow. Extract as a unit; do not split these operations into unrelated helpers.
4. **AI boundary:** AI can propose and search, but the application use cases must own writes and Spotify playback. AI output is untrusted input and must be validated.
5. **Data access:** SQL is currently embedded in route handlers and playback helpers. Extract repositories only after query inputs, row shapes and transactional/concurrency expectations are characterized.

## Extraction order

1. Characterize and extract guest join, guest track submission, DJ moderation transitions and AI-added queue tracks. The application use cases and D1 repository now live under `modules/requests/`.
2. DJ overview, queue reorder, DJ settings and 30-day completed-request retention now live under `modules/requests/`; keep future request-related D1 access in the same repository/application boundaries.
3. Keep Spotify catalogue and OAuth user-token handling separate. OAuth code exchange, refresh rotation and authenticated user API requests now live in `integrations/spotify/user-auth-service.ts`; encrypted persistence remains in `user-auth-repository.ts`. Playback paths and payloads live in `playback-api.ts`.
4. Queue dispatch, fallback policy and DJ Spotify status orchestration now use dedicated application/repository modules. The Spotify playback routes no longer issue D1 SQL directly; the Spotify OAuth authorization URL and code-completion use case now live under identity; the remaining queue-next HTTP adapter is intentionally thin.
5. Split AI context, memory, prompt catalog, provider adapter, tool adapter and use cases.
6. Convert route handlers to thin transport adapters and assemble them from `app.ts`.
7. Keep `index.ts` as the Worker composition root only.


## Extracted HTTP route modules

| Route group | Module | Responsibility |
|---|---|---|
| Guest join, guest Spotify search and guest request submission | `routes/guest.ts` | Parse guest HTTP input, enforce event-scoped guest sessions, call request/music use cases and serialize existing responses |
| DJ login and Spotify OAuth connect/callback | `routes/dj-identity.ts` | Parse login input, enforce DJ access for OAuth initiation, validate OAuth state cookie and serialize redirects |
| Shared DJ authorization | `routes/dj-auth.ts` | Reusable event-scoped DJ-session check for HTTP route adapters |

Identity policy and Spotify token exchange remain in their application/integration modules.


## DJ feature HTTP route modules

- `routes/dj-ai.ts`: DJ assistant, AI music search and AI-added queue tracks; application use cases and music policy remain in their modules.
- `routes/dj-requests.ts`: DJ overview, queue reorder, request moderation and DJ settings; lifecycle and persistence remain in request application/repository modules.
- `routes/dj-playback.ts`: Spotify playback status, devices, NEXT, volume, transport commands and approved-request dispatch. It composes playback/queue use cases and Spotify adapters.
- `routes/dj-playback-workflows.ts`: adapter workflows connecting queue dispatch, fallback playlist startup and playback automation to Spotify/D1 dependencies.

The Worker entrypoint now mounts feature route groups rather than owning their HTTP handlers.
