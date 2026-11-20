# PartyQueue — New Year's Eve 2026

Private, QR-based music request and DJ playback application for a single event.

**Environment status:** the current Cloudflare Worker, D1 database and Spotify OAuth connection are test-only. The app has not been used for a real event or real production users. Test data may be reset or recreated; do not let hypothetical production compatibility slow down engineering work.

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
- `docs/runbooks/PRODUCTION-READINESS.md` — test-environment operations and future public-release checklist
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
Run `npm run release:preflight` only when checking the optional future production deployment configuration. It is not a prerequisite for local development or test-environment work.

`npm run deploy` is currently guarded for a future production environment. That guard must not be confused with the current test environment or used as a reason to defer architecture changes. Test data and test resources are disposable.

The current D1 database is test-only and may be rebuilt when needed. Review `db/schema.sql` before applying it; it is a bootstrap schema, not a versioned migration set.

## Cloudflare and Spotify
Current test-environment assumptions and the checklist for a future real public event are documented in [the environment runbook](docs/runbooks/PRODUCTION-READINESS.md).

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
