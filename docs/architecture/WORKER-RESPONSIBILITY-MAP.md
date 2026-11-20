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
| Queue dispatch D1 lease, ordered queue read, conditional played transition and playback-state writes | `modules/queue/infrastructure/queue-dispatch-repository.ts` | `modules/queue/infrastructure/queue-dispatch-repository.ts` |
| Cohesive lock-protected PartyQueue dispatch workflow | `modules/queue/application/dispatch-next-track.ts` | `modules/queue/application/dispatch-next-track.ts` |
| Queue end-of-track advancement and fallback eligibility/retry policy | `modules/playback/application/playback-automation.ts` | `modules/playback/application/playback-automation.ts` + `modules/playback/infrastructure/playback-policy-repository.ts` |

## Remaining entrypoint responsibilities

| Current function / route | Current mixed responsibility | Intended owner |
|---|---|---|
| `requireDJ` | DJ role/event authorization | Identity application service / DJ auth middleware |
| `POST /api/guests/join` | Input validation, event-code verification, active-event query, guest insert, session issue | Guest join use case + Guest repository + Identity service |
| `GET /api/spotify/search` | Guest authorization, Spotify HTTP request, Spotify response mapping | Search use case + Spotify catalogue adapter |
| `POST /api/requests` | Guest validation, settings lookup, rate/duplicate policy, Spotify track verification, insert | Submit-request use case + Request/Guest/Settings repositories + Spotify catalogue adapter |
| `POST /api/dj/login` | DJ code validation and session issue | DJ authentication use case |
| `POST /api/dj/ai/assistant` | Preference persistence, history/context assembly, event-time logic, prompt construction, provider call, tool dispatch, cache, quota/error mapping | AI orchestrator + context assembler + memory repository + prompt catalog + Cloudflare AI provider + Spotify search tool |
| `POST /api/dj/ai/music/search` | DJ validation, query normalization, Spotify search and result mapping | AI music-search use case + Spotify catalogue adapter |
| `POST /api/dj/ai/music/add` | Duplicate check, Spotify verification, DJ guest creation, request insert, queue order write | Add-DJ-track use case + Request/Guest/Queue repositories + Spotify catalogue adapter |
| `GET /api/dj/overview` | Multiple D1 reads, settings normalization, queue ordering, response composition | Get-DJ-overview use case + repositories |
| `POST /api/dj/queue/reorder` | Queue validation, order persistence, accepted-set history persistence | Reorder-queue use case + Queue repository + DJ history repository |
| `POST /api/dj/requests/:id/:action` | State-transition policy, auto-queue setting, timestamp update | Moderate-request use case + Request/Settings repositories |
| `POST /api/dj/settings/:key` | Settings allow-list, validation and persistence | Update-DJ-setting use case + Settings repository |
| `saveSpotifyTokens` | Encrypt token pair, then delegate persistence | Spotify OAuth token store + crypto adapter |
| `spotifyUserToken` | Refresh-token flow, decrypt, refresh request and rotation; D1 operations delegated | Spotify OAuth token service + `user-auth-repository.ts` |
| `spotifyFetch` | Authenticated Spotify user API request and 401 refresh retry; token invalidation delegated | Spotify user API adapter + token repository |
| `POST /api/dj/spotify/connect` | DJ auth, OAuth state creation, redirect and cookie | Spotify OAuth start use case + route adapter |
| `GET /auth/spotify/callback` | State cookie validation, code exchange, token persistence, redirect | Spotify OAuth callback use case + route adapter |
| `startSpotifyFallback` | Fallback policy plus playback gateway call and fallback setting write | Playback application service + `integrations/spotify/playback-api.ts` |
| `startNextPartyQueueRequest` | Thin adapter supplying the Spotify playback operation | `modules/queue/application/dispatch-next-track.ts` + `modules/queue/infrastructure/queue-dispatch-repository.ts` |
| `maybeAdvancePartyQueue` | Thin adapter to queue advancement policy | `modules/playback/application/playback-automation.ts` |
| `maybeStartSpotifyFallback` | Thin adapter to fallback eligibility/retry policy | `modules/playback/application/playback-automation.ts` |
| `GET /api/dj/spotify/status` | Spotify state read plus queue advancement and fallback side effects | Get-playback-state use case coordinating queue/playback services; HTTP calls via `integrations/spotify/playback-api.ts` |
| `GET /api/dj/spotify/devices` | DJ auth, Spotify device request, response forwarding | List-Spotify-devices use case |
| `POST /api/dj/spotify/next-request` | DJ auth and queue dispatch | Dispatch-next-track use case |
| `PUT /api/dj/spotify/volume` | DJ auth, validation and Spotify volume command | Set-volume use case |
| `POST /api/dj/spotify/:action` | Command allow-list, Spotify transport command, manual pause state | Playback-command use case |
| `POST /api/dj/spotify/queue/:id` | Request state validation and queue transition | Queue-approved-request use case |
| `cleanupOldRequests` | Scheduled retention policy and D1 deletion | Cleanup-completed-requests use case + Request repository |
| `QueueRoom` | Durable Object health endpoint only | Keep isolated under `durable-objects/`; do not expand without a real coordination requirement |
| `app.notFound` and default export | Static asset fallback, Worker fetch and scheduled composition | HTTP app composition + Worker composition root |

## Architectural hotspots to address first

1. **Spotify identity separation:** catalogue client-credentials token and DJ OAuth user token are separate credentials and must stay separate modules.
2. **Playback status side effects:** `GET /api/dj/spotify/status` currently advances PartyQueue and can start the fallback playlist. This behaviour must be preserved in characterization tests before deciding whether to redesign the endpoint.
3. **Queue dispatch consistency:** the D1 lock, Spotify play call, request status transition and lock release form one critical workflow. Extract as a unit; do not split these operations into unrelated helpers.
4. **AI boundary:** AI can propose and search, but the application use cases must own writes and Spotify playback. AI output is untrusted input and must be validated.
5. **Data access:** SQL is currently embedded in route handlers and playback helpers. Extract repositories only after query inputs, row shapes and transactional/concurrency expectations are characterized.

## Extraction order

1. Complete characterization tests for guest request lifecycle and DJ request transitions.
2. Extract D1 repositories and application use cases for guests, requests and settings.
3. Keep Spotify catalogue and OAuth token handling separate; playback HTTP paths and payloads now live in `integrations/spotify/playback-api.ts`, injected with the authenticated user API request function.
4. Extract queue dispatch and playback/fallback orchestration together.
5. Split AI context, memory, prompt catalog, provider adapter, tool adapter and use cases.
6. Convert route handlers to thin transport adapters and assemble them from `app.ts`.
7. Keep `index.ts` as the Worker composition root only.
