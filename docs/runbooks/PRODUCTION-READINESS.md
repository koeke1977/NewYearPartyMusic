# Test environment and future public-release runbook

## Current environment — test only

The current Cloudflare Worker, D1 database and Spotify OAuth connection are used for development and testing only. PartyQueue has not been used for a real event or real production users. The existing database rows, Spotify test token and test configuration are disposable.

This is an explicit project assumption, not an inference from the Wrangler environment name. Do not treat the current resources as a live production system or preserve test data at the expense of sound architecture.

### Allowed during development

- Reset, drop and recreate the current test D1 database when schema work requires it.
- Replace test rows and regenerate event/DJ access-code hashes.
- Reconnect or replace the test Spotify OAuth account and tokens.
- Change test Worker bindings/configuration and redeploy the test Worker.
- Change API contracts and persisted test-data formats when the refactor warrants it; update callers and tests together.

Always keep credentials out of Git, logs and browser code. Preserve authorization, encryption, input validation, rate limits and AI/DJ permission boundaries. Disposable data does not mean disposable security.

## Current technical configuration

- Wrangler's default environment is labelled `APP_ENV = "development"`.
- The configured Worker is `partyqueue`.
- The D1 binding is `partyqueue-db`; its current identifier is a test-resource identifier.
- Runtime Worker secrets are `EVENT_ACCESS_CODE_HASH`, `DJ_ACCESS_CODE_HASH`, `SESSION_SECRET`, `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.
- Intended test/public hostname currently configured: `https://spotify.electrafest.be`.
- Spotify callback configured in the application: `https://spotify.electrafest.be/auth/spotify/callback`.
- Public guest join and DJ login should have Cloudflare edge rate limits before the application is used for a real public event.
- The Workers AI binding remains subject to the account's actual availability and free-tier limits.

## Test-environment validation

Before a test deployment or database rebuild:

1. Confirm the target is the current test Worker/D1, not a separately created real-event environment.
2. Review `wrangler.toml` and `db/schema.sql` so the command targets the intended test resource.
3. Rebuild the test D1 schema/data if needed; seed only test event settings and test hashes.
4. Set Worker secrets through Wrangler/Cloudflare secret management; never place secret values in files.
5. Reconnect the test Spotify account if the OAuth record was cleared.
6. Run TypeScript, unit/security tests, Worker dry-run and browser journeys.
7. Verify guest join, search/request, DJ login, queue moderation and playback with test accounts.

The existing `release:preflight` and `deploy` scripts are currently designed as a fail-closed gate for a future dedicated production environment. They are not prerequisites for architecture work and must not be used to imply that the current test app is live production.

## Checklist before a real public event (future, not current work)

- [ ] Confirm the event owner explicitly wants a real public launch.
- [ ] Create a dedicated production Worker environment and D1 database; do not reuse test credentials or OAuth tokens.
- [ ] Configure production Assets, D1, Durable Object namespace/migration, AI binding, scheduled trigger and exact HTTPS origin.
- [ ] Create unique production secrets: `SESSION_SECRET`, `EVENT_ACCESS_CODE_HASH`, `DJ_ACCESS_CODE_HASH`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.
- [ ] Verify Spotify Developer Mode eligibility, account restrictions, Premium playback entitlement and required scopes.
- [ ] Register the exact production OAuth callback URI.
- [ ] Configure and verify Cloudflare edge rate limits for guest join and DJ login.
- [ ] Review data retention, backup/recovery, event-day support and rollback.
- [ ] Run the complete CI suite on the exact release commit and perform controlled smoke tests.
- [ ] Obtain explicit approval before exposing the real event to guests.

No part of this future checklist should block current test development, refactoring, schema redesign or rebuilding the disposable test environment.
