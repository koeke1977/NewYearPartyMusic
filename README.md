# PartyQueue — New Year's Eve 2026

Private, QR-based music request and DJ playback application for New Year's Eve 2026.

## Product decisions
- Single event: `NYE2026`
- Public hostname: `spotify.electrafest.be`
- Guests join with an event code and nickname; no Spotify account is needed.
- One host-owned Spotify Premium account controls playback.
- Guests can search Spotify and request tracks; the DJ can moderate requests, manage queue order and control playback.
- AI provides general DJ advice and unverified track ideas only. Spotify metadata and the live queue are excluded from AI; the DJ searches Spotify separately and explicitly adds tracks. AI does not reorder the queue.
- Guest request policy: unlimited active/queued tracks per guest, with a rolling limit of 20 requests per guest per 60 minutes. Duplicate active tracks remain blocked.
- Visual direction: dark club / neon green.

## Stack
- Cloudflare Workers + Hono
- Cloudflare D1 and Durable Objects
- Cloudflare Workers AI binding (budget-guarded fallback when no local provider is configured)
- Optional owner-operated Local AI Bridge: Claude Code CLI on the DJ PC, reached through an authenticated HTTPS Cloudflare Tunnel; no Anthropic API key or paid API fallback
- Spotify Web API; audio remains in the official Spotify player/app.

## Repository layout
- `apps/worker/src/` — Worker API, application workflows and integrations
- `apps/web/` — guest and DJ web interfaces
- `db/schema.sql` — initial schema for a fresh database
- `docs/architecture/` — architecture standards and responsibility maps
- `docs/runbooks/PRODUCTION-READINESS.md` — environment separation and public-release checklist
- `scripts/release-guard.mjs` — fail-closed deployment preflight

## Local development
Requirements: Node.js 22 and npm.
```bash
npm install
npm run dev
npm run typecheck
npm test
npm run test:browser
npm run test:local-ai-bridge
```
For a disposable local D1 database, `npm run db:local` loads the complete schema; `npm run db:migrate:local` validates the ordered migration chain from an empty local database.

## Deployment environments
- `npm run deploy` targets the separate test Worker `partyqueue`.
- `npm run deploy:production` is the guarded deployment path for the live Worker `partyqueue-production`.
- Production uses its own EU D1 database, Durable Object namespace, secrets and Spotify OAuth connection.
- The public hostname `spotify.electrafest.be` is attached to the production Worker. Production data is live and must never be treated as disposable.

Read `docs/runbooks/PRODUCTION-READINESS.md` before any production change. A passing preflight does not replace explicit release approval.

## Security
The DJ assistant receives event timing, DJ-authored preferences, a bounded PartyQueue snapshot (including current queued item IDs), aggregate event-level audience preferences/crowd feedback and up to eight prior DJ/AI conversation turns from the same browser session. It does not receive Spotify credentials, raw Spotify catalogue results, direct database access or independent playback telemetry. Ordinary music suggestions remain unverified. For explicit add/remove/reorder commands, the model returns a structured action plan; the Worker validates the DJ intent, searches Spotify server-side for exact title-and-artist matches, and executes through existing authenticated PartyQueue workflows. Remove actions are limited to currently queued items; reorder actions must include the complete current queue. Mutating turns are never answer-cached. AI does not control playback. Public event-code and DJ-code endpoints use atomic D1 per-IP attempt buckets (guest join: 120/15 minutes; DJ login: 10/15 minutes). IP addresses are HMAC-hashed with the session secret before storage, and stale buckets are pruned daily. Never commit secrets, tokens, event codes, cookies or passwords. Spotify credentials and session secrets belong in Worker secrets, never browser code or committed Wrangler variables. Keep the production and test OAuth credentials and access codes separate.

PartyQueue does not stream audio. Spotify playback is controlled through the Web API while audio is played by the official Spotify app/player. Verify current Spotify Developer Mode eligibility, scopes, account restrictions and Premium playback entitlement before a live event.

## Current application capabilities
- Guest join with event code and nickname and signed 12-hour session.
- Spotify catalogue search and track requests with event-scoped guest validation.
- Unlimited active requests per guest, a rolling 20-per-60-minute guest request limit, duplicate protection and DJ moderation.
- DJ login and event-scoped protected routes.
- Spotify DJ OAuth, encrypted token storage and serialized token refresh.
- DJ overview, queue ordering, request moderation and Spotify playback controls.
- AI DJ advice plus explicit, validated PartyQueue add/remove/reorder actions; a five-role Party Brain prompt encourages bold genre, decade and energy pivots. The DJ/AI conversation is persisted per browser session in D1 (last eight turns, seven-day retention), separately from Spotify catalogue results. When configured, the local Claude Code bridge is preferred; the Cloudflare Workers AI path remains neuron-budget guarded. Spotify catalogue search and exact-match verification happen server-side; no raw catalogue results or credentials are sent to the model.
- Local AI bridge setup: `tools/local-ai-bridge/README.md`.

See [the API inventory](docs/architecture/API-INVENTORY.md) for current routes, access rules and side effects.
