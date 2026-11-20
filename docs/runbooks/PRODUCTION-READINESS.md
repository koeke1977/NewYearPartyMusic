# Production readiness and release runbook

**Status: NOT READY / NO DEPLOYMENT AUTHORIZED**

This document prepares a future release. It does not authorize Cloudflare account changes, DNS changes, OAuth connection, D1 writes or deployment.

## Current repository facts
- Wrangler currently defines one default Worker configuration and no dedicated `env.production` block.
- The default variables label the environment `development`, but the file also contains a concrete D1 database identifier. Do not assume that binding is disposable or safe to reset.
- `db/schema.sql` is an initial schema for a fresh database, not a versioned migration set.
- Runtime secrets required by the Worker are `EVENT_ACCESS_CODE_HASH`, `DJ_ACCESS_CODE_HASH`, `SESSION_SECRET`, `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.
- Intended public origin: `https://spotify.electrafest.be`.
- Spotify callback URI: `https://spotify.electrafest.be/auth/spotify/callback`.
- Public guest join and DJ login still need Cloudflare edge rate limiting before public exposure.
- The Workers AI binding must be verified for production availability, quotas and account limits.

## 1. Dedicated environment and resource isolation
- [ ] Create/confirm a dedicated production Worker environment.
- [ ] Create or identify a dedicated production D1 database; do not reuse a development/preview database.
- [ ] Record the production D1 UUID in the production-only Wrangler binding.
- [ ] Configure production Assets, D1, Durable Object namespace/migration, AI binding and scheduled trigger explicitly under `env.production`.
- [ ] Set `APP_ENV = production`, correct event ID/name and exact HTTPS `PUBLIC_ORIGIN`.
- [ ] Verify Worker name, routes and custom domain in Cloudflare before deployment.
- [ ] Keep preview/staging isolated from production data and secrets.

The production environment block does not currently exist. The deployment guard must fail until it is reviewed and committed.

## 2. Worker secrets
Configure these as Cloudflare Worker secrets for production, never plaintext vars or committed files:
| Secret | Requirement |
|---|---|
| `SESSION_SECRET` | High-entropy random value unique to production; signs sessions and encrypts Spotify tokens |
| `EVENT_ACCESS_CODE_HASH` | SHA-256 hash of the event access code, lowercase hexadecimal |
| `DJ_ACCESS_CODE_HASH` | SHA-256 hash of a separate DJ access code, lowercase hexadecimal |
| `SPOTIFY_CLIENT_ID` | Spotify application client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify application client secret |

Do not reuse test secrets or paste values into GitHub, logs or chat. Verify secret names and environment scope in Cloudflare immediately before an approved release.

## 3. D1 initialization and data safety
- [ ] Confirm target database is newly created and its UUID matches the reviewed production binding.
- [ ] Review `db/schema.sql`; it uses `CREATE TABLE IF NOT EXISTS` and seed inserts. It is a bootstrap file, not a safe upgrade migration for an existing database.
- [ ] Generate and retain actual event and DJ code hashes securely.
- [ ] Verify event row, event ID, event dates and active flag after bootstrap.
- [ ] Verify settings: `max_open_requests_per_guest = 2`, `max_requests_per_30_minutes = 5`, `auto_approve` and `requests_paused`.
- [ ] Confirm `spotify_auth` exists and is initially empty before DJ OAuth connection.
- [ ] Export/backup target database and verify recovery before subsequent schema changes.

Never run `db/schema.sql` against an existing production database as a reset/upgrade shortcut. The generic `db:remote` npm script has been removed.

## 4. Spotify application and OAuth
- [ ] Confirm Spotify Developer account/app eligibility and current Development Mode restrictions.
- [ ] Verify host account Premium entitlement and playback device.
- [ ] Confirm required scopes against current API behaviour.
- [ ] Register exact URI `https://spotify.electrafest.be/auth/spotify/callback` in Spotify Developer Dashboard.
- [ ] Confirm production `PUBLIC_ORIGIN` matches exactly (scheme, hostname and callback path).
- [ ] Complete OAuth only after the approved Worker and domain are in place.
- [ ] Verify encrypted token storage and token refresh without exposing tokens in logs or browser responses.
- [ ] Test device unavailable, expired/revoked token, Spotify 401/429/5xx and no-active-device paths.

Do not run OAuth against the production app during architecture validation.

## 5. Public endpoint protection and application security
- [ ] Configure Cloudflare edge rate limits for `POST /api/guests/join` and `POST /api/dj/login`.
- [ ] Test ordinary retries and burst attempts without blocking normal guest use.
- [ ] Confirm HTTPS, secure cookie behaviour and exact hostname.
- [ ] Confirm guest/DJ sessions are event-bound and expire as expected.
- [ ] Confirm DJ routes reject missing, expired and wrong-event sessions.
- [ ] Confirm secrets/tokens/cookies are redacted from logs.
- [ ] Confirm AI remains proposal-only and DJ confirmation is required for queue mutation.

## 6. Pre-release validation
- [ ] PR reviewed and merged only after explicit approval.
- [ ] CI green on exact release commit: TypeScript, unit/security tests, Worker dry-run, browser journeys and screenshot baselines.
- [ ] Production Wrangler configuration reviewed separately from default/preview.
- [ ] D1 bootstrap/migration SQL reviewed and tested on a disposable database.
- [ ] Spotify eligibility, scopes and API limits rechecked.
- [ ] Edge rate-limit rules verified.
- [ ] Backup/export and rollback rehearsed.
- [ ] DNS/custom-domain ownership and certificate status verified.
- [ ] Event-day operational owner and support contact confirmed.

## 7. Deployment and rollback
Deployment is a separately approved action. `npm run deploy` is guarded and requires a complete production Wrangler configuration, successful preflight and `PARTYQUEUE_ALLOW_PRODUCTION_DEPLOY=YES`. The guard then runs `wrangler deploy --env production`. It does not configure secrets, DNS, D1 or Spotify.

Before deployment, record the active Worker version and reviewed commit SHA. After deployment, run health, guest join, DJ login, Spotify connection, queue request/moderation and playback smoke tests with controlled credentials. If a critical check fails, roll back to the recorded Worker version using Cloudflare's version rollback. Do not destructively recreate D1; use a reviewed forward fix or verified backup restore.

## 8. Explicitly out of scope
- No Cloudflare production resource mutation or Worker deployment.
- No D1 remote execution, reset, migration or data export.
- No DNS/custom-domain change.
- No Spotify OAuth connection or playback.
- No production secret creation or rotation.
