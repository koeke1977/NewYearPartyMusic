# PartyQueue architecture plan

## Current status — 2026-11-22

- Repository: `koeke1977/NewYearPartyMusic`
- Mainline: `main`; PR #44 (AI list/artist repetition regression) was merged on 2026-11-22.
- Current follow-up branch: `feat/autopilot-telemetry-stop`. Repository branch limit remains two total, including `main`; do not create another branch.
- Production is live at `https://spotify.electrafest.be` on Worker `partyqueue-production`, backed by production D1. Treat all production resources, secrets, OAuth credentials and event data as live infrastructure.
- Production topology and the migration ledger were last independently verified on 2026-11-21. The repository currently contains migrations `0001`–`0006`; this does not prove which migrations are applied remotely. Inspect the remote ledger before any release.
- This document describes the current implementation and its remaining verification work. It is not release approval.

## Engineering authority

`ENGINEERING-STANDARD.md` is the binding standard for HTML/CSS/JavaScript separation, module ownership, dependency direction, tests and operational safeguards. Responsibility maps and the API inventory must describe the actual mainline implementation, not historical snapshots from the architecture-foundation branch.

Keep the app a modular monolith on Cloudflare Workers. Do not introduce microservices, a frontend framework, paid AI providers or speculative abstractions without a concrete requirement.

## Current architecture

### Frontend

- Semantic HTML owns document structure and stable hooks.
- CSS owns all static presentation; no inline styles or embedded style blocks.
- Native ES modules own page composition, controllers, views, API transport, state and session persistence.
- Browser HTTP calls are centralized in owned API clients; browser code never calls Spotify directly.
- The DJ console is PC-first, with responsive browser baselines retained.

### Worker

- Hono routes own authentication middleware, request parsing/validation and HTTP response mapping.
- Application modules own use cases and policy.
- Infrastructure repositories own D1 access.
- Spotify integration adapters own provider protocols and response normalization.
- `platform/composition/*` wires Cloudflare bindings, repositories and provider adapters.
- Queue dispatch and playback workflows remain authoritative for Spotify side effects and state transitions.
- Architecture-boundary checks enforce the current Worker dependency direction and browser transport/storage ownership.

Some application use cases still expose HTTP-shaped `{ status, body }` outcomes. Convert them to typed application outcomes only where this improves a real boundary; preserve every external API contract.

## Current implementation and authority boundaries

- Ordinary AI advice returns text and does not mutate PartyQueue.
- Explicit DJ add/remove/reorder commands use a structured action plan. The Worker validates intent, authorization, current queue state and limits, then executes through existing application use cases.
- The model receives bounded event-scoped PartyQueue state, aggregate audience/feedback signals, recent played context and limited DJ/AI conversation history. It never receives raw D1 handles, credentials, Spotify access tokens or unrestricted network access.
- For add actions, the model proposes exact title/artist pairs. Spotify catalogue search and exact normalized matching happen inside the Worker; raw Spotify catalogue results are not sent to the model.
- Remove is limited to eligible items still in the live queued set. Reorder must represent the complete current queued set exactly once and is revalidated by the queue-management use case.
- Autopilot is separate, opt-in and OFF by default. It is add-only, bounded per tick, uses the D1 lease/cooldown/budget guard and rechecks the persisted DJ STOP state before insertion. It cannot remove/reorder tracks or control playback.
- PartyQueue D1 and its saved order are authoritative. In this event setup Spotify UP NEXT is the downstream playback view populated from PartyQueue; it is not a second independent queue or signal.
- Conversation persistence contains DJ prompts and AI-generated answers only. Queue/audience context is loaded separately per request. Conversation turns are event/session scoped, capped and retained for seven days.
- Keep the configured local Claude bridge / Cloudflare Workers AI free-first model, Neuron budget guard, timeouts, cooldown and bounded prompt/output. No paid fallback without explicit product approval.

## Release sequence

1. Review the exact `main` revision and its PR checks, including typecheck, architecture checks, unit/security tests, local AI bridge contract, local D1 migrations, Wrangler dry-runs and browser/screenshot validation.
2. Before a production release, inspect the active Worker deployment and the actual remote D1 migration ledger. Never infer remote migration state from repository files.
3. Production deployment requires a separate manual `workflow_dispatch` from `main`, the explicit `YES` approval input, and the GitHub Environment `production`. Configure required reviewers on that Environment in repository Settings.
4. The release guard must inspect pending migrations and allow only strictly additive schema changes through the routine deployment path. Non-additive migrations require separate manual review.
5. Never merge, deploy, migrate production, alter secrets or mutate production data without the relevant explicit approval.
6. After an approved release, verify health, DJ login, Spotify OAuth/playback, AI conversation behaviour and scheduled retention; record the actual deployed Worker version, deployment ID and migration ledger in the production runbook.

A green PR check or ordinary push to `main` is not a production deployment and must not apply remote D1 migrations.

## Remaining focused work

- Confirm the GitHub `production` Environment has required reviewers configured; the workflow references the Environment, but repository Settings determine its actual reviewer protection.
- Run the complete validation suite for the release-gate and documentation changes on the follow-up PR.
- Keep architecture-boundary checks aligned with the engineering standard, extending them only where they can enforce concrete ownership rules without false positives.
- Re-verify production deployment and migration state only when preparing an explicitly approved release.
- Avoid feature expansion during this architecture/release hardening pass.

