# Worker responsibility map

This map is based on the current `apps/worker/src/index.ts` after the first extraction. It distinguishes code that has already moved from code that still needs a dedicated owner.

## Already extracted

| Current responsibility | Current module | Target owner |
|---|---|---|
| Worker binding contract | `platform/env.ts` | `platform/env.ts` |
| SHA-256, HMAC, base64url, constant-time comparison | `platform/security/crypto.ts` | `platform/security/crypto.ts` |
| AES-GCM encryption/decryption for stored Spotify tokens | `platform/security/crypto.ts` | `platform/security/crypto.ts` |
| Signed bearer-token creation and validation | `modules/identity/session-token.ts` | `modules/identity/` |
| Spotify client-credentials token cache | `integrations/spotify/catalog-token.ts` | `integrations/spotify/catalog-token.ts` |
| Spotify track response shape | `integrations/spotify/types.ts` | `integrations/spotify/types.ts` |
| Spotify playback HTTP endpoints, methods and request payloads | `integrations/spotify/playback-api.ts` | `integrations/spotify/playback-api.ts` |
| Encrypted Spotify user-token persistence, refresh lease and invalidation | `integrations/spotify/user-auth-repository.ts` | `integrations/spotify/user-auth-repository.ts` |
| Spotify OAuth code exchange, encrypted token lifecycle, refresh rotation and authenticated user API client | `integrations/spotify/user-auth-service.ts` | `integrations/spotify/user-auth-service.ts` |
| Queue dispatch D1 lease, ordered queue read, conditional played transition and playback-state writes | `modules/queue/infrastructure/queue-dispatch-repository.ts` | `modules/queue/infrastructure/queue-dispatch-repository.ts` |
| Cohesive lock-protected PartyQueue dispatch workflow | `modules/queue/application/dispatch-next-track.ts` | `modules/queue/application/dispatch-next-track.ts` |
| DJ overview, queue ordering and settings D1 access | `modules/requests/infrastructure/dj-queue-repository.ts` | `modules/requests/infrastructure/dj-queue-repository.ts` |
| DJ overview composition, queue reorder and setting validation | `modules/requests/application/dj-queue-management.ts` | `modules/requests/application/dj-queue-management.ts` |
| Completed-request 30-day retention policy and deletion | `modules/requests/application/cleanup-completed-requests.ts` + `request-retention-repository.ts` | Same application/repository boundary |
| Queue end-of-track advancement and fallback eligibility/retry policy | `modules/playback/application/playback-automation.ts` | `modules/playback/application/playback-automation.ts` + `modules/playback/infrastructure/playback-policy-repository.ts` |

## Remaining entrypoint responsibilities

| Current function / route | Current mixed responsibility | Intended owner |
|---|---|---|
| `requireDJ` | DJ role/event authorization | Identity application service / DJ auth middleware |
| `POST /api/guests/join` | HTTP body parsing and response serialization | `modules/requests/application/guest-request-lifecycle.ts` + `modules/requests/infrastructure/guest-request-repository.ts` + Identity session-token service |
| `GET /api/spotify/search` | Guest authorization, Spotify HTTP request, Spotify response mapping | Search use case + Spotify catalogue adapter |
| `POST /api/requests` | Guest session authorization, input validation and response serialization | `modules/requests/application/guest-request-lifecycle.ts` + `modules/requests/infrastructure/guest-request-repository.ts` + Spotify catalogue adapter |
| `POST /api/dj/login` | DJ code validation and session issue | DJ authentication use case |
| `POST /api/dj/ai/assistant` | Preference persistence, history/context assembly, event-time logic, prompt construction, provider call, tool dispatch, cache, quota/error mapping | AI orchestrator + context assembler + memory repository + prompt catalog + Cloudflare AI provider + Spotify search tool |
| `POST /api/dj/ai/music/search` | DJ validation, query normalization, Spotify search and result mapping | AI music-search use case + Spotify catalogue adapter |
| `POST /api/dj/ai/music/add` | DJ authorization, input validation and response serialization | `modules/requests/application/guest-request-lifecycle.ts` + `modules/requests/infrastructure/guest-request-repository.ts` + Spotify catalogue adapter |
| `GET /api/dj/overview` | DJ authorization and response serialization | `modules/requests/application/dj-queue-management.ts` + `dj-queue-repository.ts` |
| `POST /api/dj/queue/reorder` | DJ authorization, JSON parsing and response serialization | `modules/requests/application/dj-queue-management.ts` + `dj-queue-repository.ts` |
| `POST /api/dj/requests/:id/:action` | DJ authorization, action parameter and response serialization | `modules/requests/application/guest-request-lifecycle.ts` + `modules/requests/infrastructure/guest-request-repository.ts` |
| `POST /api/dj/settings/:key` | DJ authorization, JSON parsing and response serialization | `modules/requests/application/dj-queue-management.ts` + `dj-queue-repository.ts` |
| `saveSpotifyTokens` | Encrypt token pair, then delegate persistence | `integrations/spotify/user-auth-service.ts` + token repository |
| `spotifyUserToken` | Refresh-token flow, decrypt, refresh request and rotation; D1 operations delegated | `integrations/spotify/user-auth-service.ts` + `user-auth-repository.ts` |
| `spotifyFetch` | Authenticated Spotify user API request and 401 refresh retry; token invalidation delegated | `integrations/spotify/user-auth-service.ts` + `user-auth-repository.ts` |
| `POST /api/dj/spotify/connect` | DJ auth, OAuth state creation, redirect and cookie | Spotify OAuth start use case + route adapter |
| `GET /auth/spotify/callback` | State cookie validation, code exchange, token persistence, redirect | Route adapter + `integrations/spotify/user-auth-service.ts` |
| `startSpotifyFallback` | Fallback policy plus playback gateway call and fallback setting write | Playback application service + `integrations/spotify/playback-api.ts` |
| `startNextPartyQueueRequest` | Thin adapter supplying the Spotify playback operation | `modules/queue/application/dispatch-next-track.ts` + `modules/queue/infrastructure/queue-dispatch-repository.ts` |
| `maybeAdvancePartyQueue` | Thin adapter to queue advancement policy | `modules/playback/application/playback-automation.ts` |
| `maybeStartSpotifyFallback` | Thin adapter to fallback eligibility/retry policy | `modules/playback/application/playback-automation.ts` |
| `GET /api/dj/spotify/status` | Spotify state read plus queue advancement and fallback side effects | Get-playback-state use case coordinating queue/playback services; HTTP calls via `integrations/spotify/playback-api.ts` |
| `GET /api/dj/spotify/devices` | DJ auth, Spotify device request, response forwarding | List-Spotify-devices use case |
| `POST /api/dj/spotify/next-request` | DJ auth and queue dispatch | Dispatch-next-track use case |
| `PUT /api/dj/spotify/volume` | DJ auth, validation and Spotify volume command | Set-volume use case |
| `POST /api/dj/spotify/:action` | Command allow-list, Spotify transport command, manual pause state | Playback-command use case |
| `POST /api/dj/spotify/queue/:id` | DJ authorization and response serialization | `modules/requests/application/guest-request-lifecycle.ts` + conditional request repository update |
| Scheduled request cleanup | Worker scheduled-event adapter | `modules/requests/application/cleanup-completed-requests.ts` + `request-retention-repository.ts` |
| `QueueRoom` | Durable Object health endpoint only | Keep isolated under `durable-objects/`; do not expand without a real coordination requirement |
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
4. Extract queue dispatch and playback/fallback orchestration together.
5. Split AI context, memory, prompt catalog, provider adapter, tool adapter and use cases.
6. Convert route handlers to thin transport adapters and assemble them from `app.ts`.
7. Keep `index.ts` as the Worker composition root only.
