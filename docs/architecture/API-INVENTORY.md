# API inventory — current Worker

This inventory records the existing Hono HTTP contracts, access rules and side effects after route extraction. It is a compatibility reference, not a redesigned API contract.

## Authentication model

- **Public**: no PartyQueue bearer token required.
- **Guest bearer**: `Authorization: Bearer <sessionToken>`; validated with the signed session and bound to the configured event.
- **DJ bearer**: signed bearer token with `role: "dj"`, bound to the configured event.
- **Spotify callback**: OAuth state is validated against the short-lived HttpOnly cookie; it is not a DJ bearer route.
- **Assets fallback**: unmatched paths are forwarded to the Cloudflare Assets binding.

## Routes

| Method | Path | Access | Purpose and current side effects |
|---|---|---|---|
| GET | `/api/health` | Public | Returns health, app/event identifiers, environment and timestamp. |
| GET | `/api/config` | Public | Returns public event configuration and guest access mode. |
| POST | `/api/guests/join` | Public + event code | Applies an atomic D1 per-IP attempt bucket (120 per 15 minutes), validates event code hash and active event, inserts guest, issues 12-hour signed guest token. |
| GET | `/api/spotify/search` | Guest bearer | Searches Spotify tracks; returns normalized track metadata and Spotify attribution. |
| POST | `/api/requests` | Guest bearer | Validates event-scoped guest and pause state, allows an unlimited number of active requests per guest, enforces a rolling limit of 20 requests per guest per 60 minutes, and blocks duplicate active tracks; verifies track against Spotify and inserts with configured initial status. |
| POST | `/api/dj/login` | Public + DJ code | Applies an atomic D1 per-IP attempt bucket (10 per 15 minutes), validates DJ code hash and issues an 8-hour signed DJ token. |
| POST | `/api/dj/ai/assistant` | DJ bearer | Builds Spotify-independent context from event timing and DJ-authored preferences only, calls Cloudflare Workers AI without Spotify tools or request metrics, and caches general advice/track ideas; it cannot inspect or reorder the live queue. |
| POST | `/api/dj/ai/music/search` | DJ bearer | Performs a separate DJ-initiated Spotify search for up to 20 supplied queries; returns up to 3 matches per query to the browser only. Results are never sent to an AI model. |
| POST | `/api/dj/ai/music/add` | DJ bearer | Verifies a Spotify track, creates/uses the DJ guest, inserts it as queued and updates saved queue order. |
| GET | `/api/dj/overview` | DJ bearer | Reads settings, active requests and recent played tracks; returns dashboard summary and normalized queue order. |
| POST | `/api/dj/queue/reorder` | DJ bearer | Validates/replaces queue order and records the accepted set in DJ history. |
| POST | `/api/dj/requests/:id/:action` | DJ bearer | Applies only the current allow-listed transitions: `approve` (pending → approved or queued when auto-queue is enabled), `reject` (pending/approved/queued → rejected), `played` (approved/queued → played), `queue` (approved → queued). |
| POST | `/api/dj/settings/:key` | DJ bearer | Updates only `requests_paused`, `auto_approve` or `auto_queue`; body requires a boolean `enabled`. |
| POST | `/api/dj/spotify/connect` | DJ bearer | Creates Spotify OAuth state and redirects to Spotify authorization; sets a short-lived HttpOnly state cookie. |
| GET | `/auth/spotify/callback` | Spotify OAuth state cookie | Validates state, exchanges authorization code, encrypts and stores Spotify tokens, then redirects to DJ console. |
| GET | `/api/dj/spotify/status` | DJ bearer | Reads playback/device/track state **and can trigger queue auto-advance or fallback playlist playback**. This endpoint is not side-effect-free. |
| GET | `/api/dj/spotify/devices` | DJ bearer | Reads available Spotify devices. |
| POST | `/api/dj/spotify/next-request` | DJ bearer | Starts the next PartyQueue track in Spotify and marks the request played after Spotify confirms success. Uses a D1 lock to prevent concurrent NEXT actions. |
| PUT | `/api/dj/spotify/volume` | DJ bearer | Validates integer volume 0–100 and updates Spotify device volume. |
| POST | `/api/dj/spotify/:action` | DJ bearer | Allows play, pause, next and previous commands; play/pause also update the manual-pause setting. |
| POST | `/api/dj/spotify/queue/:id` | DJ bearer | Changes an approved request to queued. |

Unmatched paths are passed to `ASSETS.fetch`.

## Contract preservation requirements

During extraction, preserve:

- Exact HTTP method and URL, including parameter names.
- Request body field names, validation boundaries and accepted values.
- Status codes and response JSON property names.
- Guest versus DJ authorization semantics.
- Cookie names, attributes, expiry and OAuth state behaviour.
- Existing D1 table/column names and persisted setting keys.
- Spotify API calls, command ordering, lock semantics and success criteria.
- The current side effects of `GET /api/dj/spotify/status` until a separate API redesign is explicitly approved.

## High-risk behaviour requiring characterization tests

1. Session token creation/verification, expiry, tampering and event binding.
2. Existing encrypted Spotify OAuth token compatibility. Encryption format is AES-GCM with a 12-byte IV prefixed to ciphertext, encoded as base64url; key derivation is SHA-256 of `SESSION_SECRET`.
3. Unlimited active requests per guest, rolling 60-minute rate limit (20 per guest), duplicate checks and auto-approve/auto-queue decisions.
4. Request state transition allow-list and timestamps.
5. Queue reorder validation, saved order and DJ accepted-set history.
6. Spotify NEXT lock acquisition/release and only marking a request played after a successful Spotify response.
7. Playback status polling's auto-advance/fallback side effects.
8. Spotify OAuth state cookie validation and token refresh concurrency.
9. AI preference persistence, answer caching and rate limiting. The AI context must remain free of Spotify catalogue metadata, album art, playback state and live queue data; Spotify search is a separate browser-initiated action after AI returns, and AI must never reorder the queue.
10. Scheduled cleanup: completed/terminal requests older than 30 days only; pending, approved and queued requests remain untouched.
11. Public credential-guessing protection: `/api/guests/join` and `/api/dj/login` use atomic D1 upsert buckets keyed by HMAC of Cloudflare's trusted client-IP header and endpoint scope. Guest join is capped at 120 attempts and DJ login at 10 attempts per 15-minute window; only hashes are stored and the scheduled job prunes expired buckets. Cloudflare's single custom rate-limit rule slot is already used by leaked-credential protection, so this application-level control provides baseline protection without replacing that rule. Verify shared-NAT event-day behaviour before public launch.

## Current route ownership

- Public health and event configuration are implemented in `routes/system.ts`.
- Guest join, catalogue search and guest request transport are implemented in `routes/guest.ts`.
- DJ login and Spotify OAuth callback transport are implemented in `routes/dj-identity.ts`.
- DJ AI endpoints are implemented in `routes/dj-ai.ts`; AI orchestration is delegated to `modules/ai/application/execute-dj-assistant.ts` and its context, prompt, memory, provider and budget collaborators.
- DJ overview, queue reorder, moderation and settings transport are implemented in `routes/dj-requests.ts`.
- Spotify playback transport is implemented in `routes/dj-playback.ts`; the route composes application workflows and Spotify adapters.
- DJ feature route groups apply shared event-scoped session middleware from `routes/dj-auth.ts`. DJ login and OAuth callback retain their distinct public/state-cookie boundaries.
- Scheduled cleanup is delegated by `scheduled/handler.ts` to the request-retention use case.
- SQL ownership is in request, queue, identity and playback infrastructure repositories, not in the HTTP route modules.
- Spotify client-credentials catalogue access and DJ OAuth user-token access are separate credential flows and must remain distinct.
- `QueueRoom` is currently only a health endpoint; do not assume it is responsible for queue synchronization or WebSocket delivery.

This is an incremental migration. Continue checking that route modules remain transport adapters and that orchestration stays in application modules; do not claim the entire backend is complete based on route extraction alone.
