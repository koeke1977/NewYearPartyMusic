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

Guest music-request policy is separate from access-code abuse throttling:
- No per-guest limit on the number of pending, approved or queued requests.
- Maximum 20 submitted requests per guest in any rolling 60-minute window.
- A track already pending, approved or queued cannot be requested again until it reaches a terminal state.
- The hourly quota is checked atomically in the same D1 insert statement to remain correct under concurrent submissions.

The application also implements atomic D1-backed per-IP attempt throttling for the public access-code endpoints:

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

## Data retention and recovery

The production D1 database reports `version: production`, so it supports Cloudflare D1 Time Travel. Time Travel is automatic and does not need to be enabled; it provides point-in-time recovery. The available retention depends on the Workers plan: 7 days on Workers Free or 30 days on Workers Paid. Confirm the actual Workers plan in the Cloudflare account before relying on the longer window.

Application retention:
- Completed/declined/cancelled request rows older than 30 days are deleted by the daily scheduled cleanup.
- Pending, approved and queued requests are deliberately excluded from that cleanup.
- Authentication attempt buckets older than one day are deleted by the same daily cleanup.
- No separate R2 export/archive is currently configured.

Recovery procedure (D1 data recovery is separate from Worker code rollback):
1. Identify the incident time and confirm the Workers plan's Time Travel retention window.
2. Inspect the intended restore point with `npx wrangler d1 time-travel info partyqueue-production-db --env production --timestamp="<UTC timestamp>"`.
3. Record the current bookmark and the restore bookmark. Export the current database first if preserving post-incident data is important.
4. Have the release owner explicitly approve the restore. A Time Travel restore overwrites the live database and cancels in-flight queries.
5. Restore only after confirming the target timestamp/bookmark: `npx wrangler d1 time-travel restore partyqueue-production-db --env production --bookmark="<verified bookmark>"`.
6. Re-run the production health, guest, DJ and Spotify checks. If the restore itself must be undone, use the previous bookmark returned by Cloudflare.

Never run a restore as a routine rollback or without an explicitly approved incident decision. Cloudflare D1 Time Travel documentation: https://developers.cloudflare.com/d1/reference/time-travel/

## Build, validation and deployment

GitHub pull-request validation runs:

1. TypeScript typecheck.
2. Architecture dependency-boundary checks.
3. Unit/security tests.
4. Wrangler dry-runs for test and production environments.
5. Playwright guest and DJ browser journeys.
6. Screenshot baseline capture.

Cloudflare production builds run typecheck, architecture checks and Vitest before applying production D1 migrations and deploying. A failed build command must stop before the deploy command. Production build configuration is bound to the Worker system tag, not the human-readable Worker name.

The production release completed on 2026-11-20. The latest validated build reported 65 test files and 268 unit tests passing on Vitest 5.1.1. Bun audit reported zero vulnerabilities across 198 packages (and zero in production dependencies). The active production Worker version is 9: `b0d3f711-316b-440e-a3f1-d235e72dce5e`. The Cloudflare production build now gates deployment on typecheck, architecture checks, unit tests and a full dependency audit; any audit finding fails the build. Always inspect the active deployment before a release or rollback.

## Release verification checklist

### Confirmed for the 2026-11-20 production release

- [x] Dedicated production Worker and EU D1 provisioned.
- [x] Production D1 migrations 0001 and 0002 applied and migration ledger initialized.
- [x] Production secrets configured.
- [x] Worker bindings and daily cron configured.
- [x] Production Worker deployed and public hostname moved from test to production.
- [x] Public application visible, as confirmed by the release owner.
- [x] Spotify OAuth connection succeeds, as confirmed by the release owner.
- [x] Typecheck, architecture check and 264 unit tests passed in the production build using Vitest 5.1.1.
- [x] Bun audit reports zero vulnerabilities across 198 packages; production dependency audit also clean.
- [x] Public privacy notice published and linked from guest and DJ screens.
- [x] In-app Spotify disconnect action deletes encrypted OAuth credentials from production D1.
- [x] Production build gate now fails on any dependency audit finding.
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

Before using Spotify as the event PA source, obtain a clear policy determination from Spotify for the exact setup where necessary. Section III.4 of the Developer Policy prohibits an SDA that plays content from one source to several simultaneous listeners; the exact application to a DJ-controlled Spotify device feeding a local PA is not conclusively resolved here. Section III.10 also prohibits products targeted to businesses and public playback from businesses, while Section III.7 restricts mixing/segueing Spotify content. Do not represent the playback integration as policy-cleared without Spotify's written confirmation for this exact arrangement.

For Belgium, Unisono says its private-family exception applies only if all conditions are met: the event is free, has no entry fee, artistic budget, sponsorship or commercial purpose, is not advertised, takes place within the family circle and is held at home. If any condition is not met, check and arrange the appropriate Unisono licence before playing recorded/streamed music. Unisono also says a streaming subscription does not replace the required event licence. If Spotify's intended use is not permitted, use a properly licensed playback source/service rather than attempting to work around the restrictions.

The application now publishes a privacy notice at `https://spotify.electrafest.be/privacy.html`, linked from both the guest and DJ screens. The DJ console also has a `DISCONNECT SPOTIFY` action that deletes the locally stored encrypted OAuth credentials; an active token-refresh lease blocks the deletion and asks the DJ to retry. This does not revoke the app's authorization at Spotify itself: the DJ can also remove PartyQueue from the Spotify account's Apps settings. The event organizer must register the privacy-notice URL in the Spotify Developer Dashboard and ensure the contact channel referenced in the notice (the event invitation) is current and reachable. Do not claim full Spotify policy compliance until the exact event playback arrangement is confirmed with Spotify where necessary and Belgian public-performance licensing has been checked.

References:
- https://developer.spotify.com/policy
- https://developer.spotify.com/terms
- https://developer.spotify.com/compliance-tips
- https://www.unisono.be/nl/licenties-evenementen
- https://www.unisono.be/nl/knowledgebase/heb-ik-een-licentie-nodig-als-ik-in-mijn-zaak-bedrijf-of-tijdens-mijn-evenement-muziek-speel-via-een-streamingdienst

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
