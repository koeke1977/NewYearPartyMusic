# Development checklist

This checklist reflects the current implementation on `refactor/architecture-foundation`. It is the working source of truth; do not revive obsolete tasks from earlier project notes.

## Environment

- The deployed Cloudflare Worker, D1 database and Spotify OAuth connection are test-only.
- PartyQueue has not been used for a real event or real production users.
- Existing D1 rows, test credentials and Spotify OAuth state are disposable. Resetting or recreating them is acceptable when it simplifies engineering or schema work.
- Keep secrets out of source control and browser code. Security boundaries remain mandatory even though the data is disposable.

## Application capabilities

- [x] Guest join with event code and nickname
- [x] Spotify catalogue search and track requests
- [x] Configurable guest request limits, duplicate protection and moderation
- [x] DJ authentication and protected routes
- [x] Spotify OAuth, encrypted token persistence and refresh lifecycle
- [x] DJ overview, queue ordering, moderation and playback controls
- [x] Queue dispatch lease and playback automation
- [x] AI music advice and proposals with DJ authorization
- [x] Free-tier AI budget and bounded read-only Spotify catalogue tool

## Architecture work completed

- [x] Binding engineering standard and modular-monolith target architecture
- [x] Worker route groups and composition adapters
- [x] Worker identity, request, queue, playback, Spotify and AI modules
- [x] D1 repository extraction for guest requests, DJ queue, retention, AI context/settings/budget and queue dispatch
- [x] Spotify catalogue, OAuth/user-auth, playback and status gateway adapters
- [x] Native frontend ES modules for guest and DJ features
- [x] DJ playback sequencing, stale-response guards and serialized writes
- [x] CSS ownership split, selector inventory and browser screenshot baselines
- [x] API inventory and Worker/frontend/AI responsibility maps
- [x] Release guard and test-environment runbook
- [x] TypeScript, security characterization tests, Worker dry-run and browser journeys green on the validated code head
- [x] Automated Worker application dependency-boundary check integrated into CI
- [x] Spotify catalogue and playback-control application ports with typed provider adapters
- [x] DJ AI workflow controller separated from DOM-only view rendering

## Remaining architecture work

1. Complete dependency inversion for the remaining request, music and playback workflows; application code should consume application-owned repository/provider ports rather than concrete D1 bindings or Fetch responses.
2. Audit the Spotify console controller for any remaining coordination/presentation mixing; do not add pass-through layers where the existing view/controller boundary is already clear.
3. Extend automated dependency-boundary checks to frontend feature boundaries where a stable rule can be enforced without brittle path whitelists.
4. Review CSS selector duplication/unused rules and accessibility without changing the visual language unintentionally.
5. Add focused linting and formatting only if it can be introduced without unnecessary dependencies or broad churn.
6. Keep full CI green after each coherent extraction.

## Change principles

- Preserve user-visible behaviour and API contracts unless a deliberate behaviour change is separately tested.
- Prefer correcting architecture over preserving disposable test data or legacy test schemas.
- Rebuild the test D1 database or reconnect the test Spotify account when that is the cleanest path.
- Keep Spotify secrets and session credentials server-side and out of Git.
- AI remains advisory: only DJ-authorized workflows may mutate requests, queue order or playback.
- Avoid paid services, new frameworks and unnecessary runtime dependencies.

See [architecture/REENGINEERING-PLAN.md](architecture/REENGINEERING-PLAN.md) and [the environment runbook](runbooks/PRODUCTION-READINESS.md) for details.
