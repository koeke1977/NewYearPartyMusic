# PartyQueue — New Year's Eve 2026

Private, QR-based music request and DJ playback application for a single event.

## Product decisions
- Single event: `NYE2026`
- Intended public hostname: `spotify.electrafest.be`
- Guests join with an event code and nickname; no Spotify account is needed.
- One host-owned Spotify Premium account controls playback.
- Guests can search Spotify and request tracks; the DJ can moderate requests, manage queue order and control playback.
- AI provides advice and proposals; queue changes require DJ authorization.
- Initial limits: 2 open requests per guest and 5 requests per 30 minutes.
- Visual direction: dark club / neon green.

## Stack
- Cloudflare Workers + Hono
- Cloudflare D1 and Durable Objects
- Cloudflare Workers AI binding (optional at runtime; subject to account availability and limits)
- Spotify Web API; audio remains in the official Spotify player/app.

## Repository layout
- `apps/worker/src/` — Worker API, application workflows and integrations
- `apps/web/` — guest and DJ web interfaces
- `db/schema.sql` — initial schema for a fresh database
- `docs/architecture/` — architecture standards and responsibility maps
- `docs/runbooks/PRODUCTION-READINESS.md` — release prerequisites and operational checklist
- `scripts/release-guard.mjs` — fail-closed deployment preflight

## Local development
Requirements: Node.js 22 and npm.
```bash
npm install
npm run dev
npm run typecheck
npm test
npm run test:browser
```
For a disposable local D1 database only: `npm run db:local`.

## Validation and deployment safety
Run `npm run release:preflight` to check that a dedicated production Wrangler environment is explicitly configured. This check is local-only: it does not contact Cloudflare, inspect secrets, deploy or modify data.

`npm run deploy` is fail-closed. It requires the production configuration to pass and the operator to explicitly set `PARTYQUEUE_ALLOW_PRODUCTION_DEPLOY=YES`. This is an additional safety latch, not authorization to release. No production deployment is part of the architecture refactor.

There is deliberately no generic remote D1 schema command. Do not apply the initial schema to an existing or production database.

## Cloudflare and Spotify
Required production bindings, secrets, event configuration, OAuth callback and rollback steps are documented in [the production readiness runbook](docs/runbooks/PRODUCTION-READINESS.md).

Never commit secrets, tokens, event codes, cookies or passwords. Spotify credentials and session secrets belong in Worker secrets, never browser code or committed Wrangler variables.

PartyQueue does not stream audio. Spotify playback is controlled through the Web API while audio is played by the official Spotify app/player. Verify current Spotify Developer Mode eligibility, scopes, account restrictions and API availability before a live event.

Intended OAuth callback URI: `https://spotify.electrafest.be/auth/spotify/callback`. Register this exact URI in the Spotify Developer Dashboard for the corresponding app/environment.

## Current application capabilities
- Guest join with event code, nickname and signed 12-hour session.
- Spotify catalogue search and track requests with event-scoped guest validation.
- Configurable open-request and 30-minute rate limits, duplicate protection and DJ moderation.
- DJ login and event-scoped protected routes.
- Spotify DJ OAuth, encrypted token storage and serialized token refresh.
- DJ overview, queue ordering, request moderation and Spotify playback controls.
- AI-assisted music advice and proposals with explicit DJ authorization for queue changes.

See [the API inventory](docs/architecture/API-INVENTORY.md) for current routes, access rules and side effects.
