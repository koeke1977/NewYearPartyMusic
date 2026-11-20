# Production-readiness and release runbook

## Environment separation

PartyQueue has two deliberately isolated Cloudflare environments:

| Resource | Test | Production |
|---|---|---|
| Worker | `partyqueue` | `partyqueue-production` (Wrangler `--env production`) |
| D1 | `partyqueue-db` | `partyqueue-production-db` |
| D1 ID | `d627ba29-4d77-4ddd-a115-19022685f5c1` | `0599c4f5-cd8c-4e8f-9557-54dd63690d29` |
| APP_ENV | `development` | `production` |
| Origin | `https://spotify.electrafest.be` | `https://spotify.electrafest.be` |
| Spotify OAuth | Test app/credentials | Dedicated production app/credentials required |

The production D1 database has been provisioned in the EU jurisdiction. Its initial schema and authentication-throttling table are applied and verified, including the NYE2026 event row and default settings. A `partyqueue-production` Worker script exists only as an inert 503 placeholder: its `workers.dev` subdomain is disabled, it has no custom domain, and it has no D1, Durable Object, AI, assets or scheduled bindings. The script has secret bindings named `SESSION_SECRET`, `EVENT_ACCESS_CODE_HASH`, `DJ_ACCESS_CODE_HASH`, `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`; Cloudflare does not return secret values, so their correctness is unverified. The hostname `spotify.electrafest.be` is currently attached to the test Worker; do not move it until the real production app has passed smoke tests and the release owner approves the cutover.

## Production configuration committed to Wrangler

The `[env.production]` configuration now defines:
- An isolated D1 binding to `partyqueue-production-db`.
- A separate Durable Object namespace/migration for `QueueRoom`.
- Static assets, the Workers AI binding, and the scheduled cleanup trigger.
- `APP_ENV = "production"` and the exact public HTTPS origin.
- Workers Logs and Traces observability.

The GitHub validation workflow checks both the test and production Wrangler configurations with dry-runs and executes the fail-closed static release preflight. These checks do not deploy either environment.

## Required before first production deployment

- [x] Dedicated production D1 database created in EU jurisdiction.
- [x] Isolated Wrangler production bindings/configuration committed on the release branch.
- [x] Versioned initial schema migration prepared at `db/migrations/0001_initial_schema.sql` and bound to the production D1 environment.
- [x] Applied and verified the initial schema on the production D1 database; the NYE2026 event row and four default settings are present.
- [x] Added and applied D1 migration `0002_auth_attempt_buckets.sql` for atomic per-IP authentication throttling. The D1 SQL was verified: two attempts succeeded, the third was denied at a test threshold of two, and the temporary test row was removed.
- [ ] On first Wrangler production release, apply the configured D1 migrations to initialize Wrangler's migration ledger. Migrations `0001` and `0002` are idempotent and safely reconcile the already-applied schema.
- [x] Created the inert `partyqueue-production` placeholder script with `workers.dev` disabled and no route; it returns HTTP 503 and is not the PartyQueue app.
- [ ] Replace the placeholder with the actual production application bundle and attach the production D1, QueueRoom Durable Object, AI, static assets and scheduled trigger.
- [ ] Verify/set unique production secret values on `partyqueue-production`: `SESSION_SECRET`, `EVENT_ACCESS_CODE_HASH`, `DJ_ACCESS_CODE_HASH`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`. Secret values cannot be read back; verify them with the production login and OAuth smoke tests.
- [ ] Generate and securely distribute separate event and DJ access codes; store only their hashes in Worker secrets.
- [ ] Confirm the exact event use is permitted under Spotify's current Developer Policy before enabling playback. The policy prohibits non-interactive internet webcasting from one source to multiple simultaneous listeners and public/commercial playback from a business. Spotify describes its consumer service as personal and non-commercial. If this is a public/commercial event, do not use a consumer Spotify account for the PA; obtain written permission or use a properly licensed public-performance service. For a private non-commercial event, confirm that this exact setup is permitted rather than assuming.
- [ ] Create/configure the dedicated production Spotify app, register `https://spotify.electrafest.be/auth/spotify/callback`, and verify current Developer Mode eligibility, scopes and Premium playback entitlement. Development Mode requires the app owner to maintain Premium and is limited to five authorized Spotify users; PartyQueue guests do not need Spotify accounts, only the DJ account connects.
- [x] Removed Spotify track metadata, album art, live queue and playback state from the Cloudflare AI context and the ChatGPT handoff. The AI receives only event timing, DJ-authored preferences and the DJ's own question. It receives no request data, counts or derived usage metrics. Spotify catalogue search is a separate browser-initiated step after the AI response; results are not sent back to AI. AI queue reordering is disabled; manual DJ queue controls remain available.
- [x] Added direct Spotify content links wherever track metadata is shown in guest search, DJ queue, playback console and AI suggestion results.
- [x] Implemented atomic D1-backed, per-IP attempt throttling for both public code endpoints. Guest join allows 120 attempts per 15 minutes per IP; DJ login allows 10 attempts per 15 minutes per IP. Only HMAC-hashed IP values are stored, and expired buckets are removed by the daily scheduled cleanup.
- [ ] Verify the throttling thresholds under realistic event-day shared-Wi-Fi load. The zone's single custom rate-limit rule slot remains occupied by the existing leaked-credential check; it was left unchanged. The application-level guard avoids requiring a plan upgrade for baseline protection; separate edge rules remain recommended defence in depth.
- [ ] Verify the production Durable Object migration, AI binding availability/limits, cron trigger, logs and traces.
- [ ] Deploy `partyqueue-production` without attaching the public hostname; test its workers.dev URL with private test codes and a dedicated Spotify account.
- [ ] Smoke-test guest join, catalogue search, request submission, DJ login, moderation, queue ordering, Spotify OAuth, playback, logout and scheduled cleanup.
- [ ] Confirm data retention, backup/recovery, event-day support, monitoring and rollback procedure.
- [ ] Obtain explicit approval for the hostname cutover; then move `spotify.electrafest.be` from the test Worker to `partyqueue-production` and repeat public smoke tests.

## Deployment safety

- `npm run deploy` continues to target the disposable test Worker.
- `npm run deploy:production` runs the static guard and requires `PARTYQUEUE_ALLOW_PRODUCTION_DEPLOY=YES`; this is a deliberate last-mile latch, not a substitute for the checklist above.
- Do not copy test secrets or OAuth tokens into production.
- A Worker rollback does not roll back D1 or Durable Object data. Keep schema/data recovery separate from code rollback.
- Do not deploy production or switch the public hostname while any required checklist item remains open.
