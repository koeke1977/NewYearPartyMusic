# PartyQueue production operations runbook

Last verified: 2026-11-20

## Live production topology

PartyQueue is deployed and serving the public event application.

| Resource | Test | Production |
|---|---|---|
| Worker | `partyqueue` | `partyqueue-production` |
| Worker tag | `fcd96a873348463a85684c420910feed` | `fedfc6edd2a0420eae2fbcd5c4e262c2` |
| D1 | `partyqueue-db` | `partyqueue-production-db` |
| D1 ID | `d627ba29-4d77-4ddd-a115-19022685f5c1` | `0599c4f5-cd8c-4e8f-9557-54dd63690d29` |
| Public hostname | — | `https://spotify.electrafest.be` |
| Workers.dev | Test worker | `https://partyqueue-production.koen-f02.workers.dev` |

Production D1 is provisioned in the EU jurisdiction. Migrations `0001` and `0002` are applied and recorded in the production migration ledger. The production Worker has the D1, QueueRoom Durable Object, Workers AI and static assets bindings. Its daily scheduled cleanup trigger is configured.

The public hostname `spotify.electrafest.be` is attached to `partyqueue-production`; the test Worker no longer owns the hostname. The release owner has confirmed that the public application is visible and that the Spotify account connection succeeds.

## Production secrets

The production Worker has these secret bindings configured. Values are intentionally not stored in Git or printed by Cloudflare:

- `SESSION_SECRET`
- `EVENT_ACCESS_CODE_HASH`
- `DJ_ACCESS_CODE_HASH`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

Never copy test credentials into production. Rotate a secret if it may have been exposed. Confirm secret correctness through the relevant authenticated application flow, not by attempting to read secret values back.

## Architecture and AI/Spotify boundary

The application is a modular monolith with separate Worker and browser boundaries, typed application contracts, platform adapters and composition roots. See `docs/architecture/ENGINEERING-STANDARD.md` and `docs/architecture/REENGINEERING-PLAN.md`.

Spotify catalogue, queue, playback metadata and track names are not passed to the AI context or ChatGPT handoff. Spotify catalogue search runs separately after the AI response. The DJ explicitly chooses tracks and retains control of queue changes. AI cannot independently mutate the queue.

Spotify content displayed by the application must retain attribution and a direct Spotify content link. Do not use Spotify content to train AI/ML systems or create derived listening profiles or metrics.

## Abuse protection and rate limits

The application implements atomic D1-backed per-IP attempt throttling for the public access-code endpoints:

- Guest join: 120 attempts per 15 minutes per IP.
- DJ login: 10 attempts per 15 minutes per IP.
- Only HMAC-hashed IP identifiers are stored in the throttle table.
- Expired attempt buckets are removed by the daily scheduled cleanup.

The Cloudflare zone's existing HTTP rate-limit ruleset currently contains one enabled rule: leaked-credential detection, blocking 5 matching requests per 10 seconds. This rule was left intact. Do not replace or weaken it to add an application-specific rule without reviewing the zone's plan limits and the existing rule first. The D1 throttles are the current application-specific baseline; reassess thresholds against expected shared event Wi-Fi traffic before the event.

## Observability and privacy

Production Workers Observability is enabled:

- Persisted invocation logs: enabled, 100% sampling.
- Persisted traces: enabled, 10% sampling.
- Query-string redaction: enabled in the production Wrangler configuration so OAuth authorization codes and state values are not retained in request URLs in logs/traces.
- Real-time Issues grouping: enabled in the production Wrangler configuration.

Do not log access codes, session tokens, Spotify access/refresh tokens, OAuth authorization codes, or request bodies containing personal data. Keep log queries and exports scoped to operational diagnosis. Review Cloudflare retention and account usage before increasing sampling or exporting logs.

## Build, validation and deployment

GitHub pull-request validation runs:

1. TypeScript typecheck.
2. Architecture dependency-boundary checks.
3. Unit/security tests.
4. Wrangler dry-runs for test and production environments.
5. Playwright guest and DJ browser journeys.
6. Screenshot baseline capture.

Cloudflare production builds run typecheck, architecture checks and Vitest before applying production D1 migrations and deploying. A failed build command must stop before the deploy command. Production build configuration is bound to the Worker system tag, not the human-readable Worker name.

The production release completed on 2026-11-20. The validated build reported 65 test files and 266 unit tests passing. The current deployed Worker version at the time of this runbook update is recorded in the Cloudflare deployment history; always inspect the active deployment before a release or rollback.

## Release verification checklist

### Confirmed for the 2026-11-20 production release

- [x] Dedicated production Worker and EU D1 provisioned.
- [x] Production D1 migrations 0001 and 0002 applied and migration ledger initialized.
- [x] Production secrets configured.
- [x] Worker bindings and daily cron configured.
- [x] Production Worker deployed and public hostname moved from test to production.
- [x] Public application visible, as confirmed by the release owner.
- [x] Spotify OAuth connection succeeds, as confirmed by the release owner.
- [x] Typecheck, architecture check and 266 unit tests passed in the production build.
- [x] Browser guest/DJ journeys passed in the GitHub CI run for the architecture release.
- [x] Production Workers Logs and Traces enabled.
- [x] Query-string redaction and Real-time Issues enabled and verified in the active production Worker settings (version 5, 2026-11-20); Wrangler configuration also records these settings as source of truth.

### Event-day checks still requiring an authenticated human session

- [ ] Complete one end-to-end guest journey against production: join with an event code, search catalogue, submit one test request, then remove the test request.
- [ ] Complete DJ login, moderation, queue ordering and removal against production.
- [ ] Confirm a real Spotify Premium playback device can start, pause, skip and recover after a transient API/device error. Do not expose access codes or OAuth tokens during testing.
- [ ] Confirm the daily cleanup trigger executes and removes only expired data.
- [ ] Check production Workers Logs, Real-time Issues and error rate before opening the event to guests.
- [ ] Confirm event-day support contact and a tested data recovery/retention procedure.

The assistant cannot independently validate a signed-in browser session or the actual PA playback device. A user-confirmed Spotify OAuth connection is not proof of successful audio playback on the event's target device.

## Spotify policy and public-performance compliance — explicit release caveat

A successful OAuth connection does not establish that the intended event use is permitted.

Spotify's current Developer Policy (effective 15 May 2025) restricts streaming applications from commercial use, prohibits non-interactive internet webcasting from one source to multiple simultaneous listeners, and restricts products targeted at businesses. Spotify's consumer service is described as personal and non-commercial. The precise use of PartyQueue for an event, the nature of the event and the playback arrangement must be checked against the current Spotify Developer Terms and Policy. Do not assume that calling an event private or non-commercial makes every form of public playback or API-controlled streaming permitted.

Before using Spotify as the event PA source, obtain a clear policy determination from Spotify for the exact setup where necessary. Separately verify Belgian public-performance licensing obligations with the relevant rights/licensing body. If the intended use is not permitted, use a properly licensed playback source/service rather than attempting to work around Spotify's restrictions.

References:
- https://developer.spotify.com/policy
- https://developer.spotify.com/compliance-tips
- https://support.spotify.com/article/spotify-public-commercial-use/

## Rollback procedure

Cloudflare Worker rollback changes the deployed Worker version for its routes and domains. It does not roll back D1 data or Durable Object state. A previous Worker version can fail if a later release changed a database schema or Durable Object lifecycle in a way that the older code cannot use.

1. Identify the last known-good production Worker version in Cloudflare > Workers & Pages > `partyqueue-production` > Deployments. On 2026-11-20, the previous deployed version before the latest validated release was `d3eeea82-8e99-419e-b302-ca24f42b4f68`; verify it is still compatible before using it.
2. Check whether any D1 migration or Durable Object lifecycle change occurred after that version. Do not assume a Worker rollback reverses those changes.
3. From the repository root with authenticated Wrangler access, roll back explicitly:
   `npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --name partyqueue-production --message "Rollback PartyQueue production"`
4. Verify the active deployment/version, public homepage, `/api/health`, guest login, DJ login and Spotify connection.
5. If a schema migration caused the incident, follow a separate forward-fix or tested data-recovery plan. Never manually delete or reverse production rows as an improvised rollback.

Cloudflare rollback documentation: https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/

## Deployment safety

- `npm run deploy` targets the disposable test Worker.
- `npm run deploy:production` runs the static production guard and requires `PARTYQUEUE_ALLOW_PRODUCTION_DEPLOY=YES`.
- The Cloudflare production build runs validation before migrations and deployment.
- Keep production secrets outside Git.
- Prefer additive, backward-compatible D1 migrations so the previous Worker version remains usable during rollback.
- Never run a production rollback or migration reversal without first checking the data and Durable Object compatibility.
