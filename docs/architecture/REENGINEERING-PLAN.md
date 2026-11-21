# PartyQueue architecture plan

## Current status

- Repository: `koeke1977/NewYearPartyMusic`
- Baseline: current `main` commit `3100095d09ff3065f7bc55c7de73bb35260aaea6`
- Working branch: `refactor/architecture-mainline`
- Review PR: #15 — architecture reconciliation and DJ AI conversation memory
- Scope: complete focused improvements on top of the working mainline; do not merge the divergent `refactor/architecture-foundation` branch wholesale.

**Production is live.** The public hostname `spotify.electrafest.be` is attached to `partyqueue-production`, backed by the EU D1 database `partyqueue-production-db`. The latest verified deployment is `8d71ab10-dbd8-4025-b68f-1a5bd3e13b6b` (2026-11-21 08:35:44 UTC), serving 100% of traffic with Worker version ID `ce398cbc-ed90-4c25-89ef-d26dcec9957e`. The production D1 migration ledger contains `0001`, `0002` and `0003`. These are live event resources, not disposable test resources.

No production database mutation, secret change, hostname change, merge to `main` or deployment has been performed by this branch. Migration `0004_dj_ai_conversation.sql` is new on this PR branch and has **not** been applied to production.

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

## AI architecture and privacy boundary

The DJ assistant is deliberately Spotify-independent. It receives only:
- Event name and derived Belgian local event time.
- Explicit DJ-authored preferences.
- The DJ's current question.
- On this PR branch only, up to eight recent DJ/AI conversation turns for the same browser session.

It receives no Spotify catalogue/search results, track or artist metadata, album art, playback state, live queue, guest requests, request counts or Spotify-derived metrics. No Spotify tool is exposed to the model. AI suggestions are unverified general-knowledge ideas; the DJ searches Spotify separately and explicitly selects any action. AI cannot add tracks, reorder the queue, moderate requests, change settings or control playback.

Existing preference memory stores only explicit DJ preference statements. This PR adds separate conversation memory: a browser-generated session UUID, successful DJ prompts and AI-generated answers, a maximum of eight stored turns per session and seven-day retention. Spotify results are never written to that store. The new D1 migration is locally validated but not yet applied to either remote database.

Provider/cost rules remain:
- Prefer the authenticated owner-operated local Claude Code bridge when configured.
- Otherwise use Cloudflare Workers AI with its Neuron budget guard and safety buffer.
- Do not add a paid API fallback.
- Keep timeouts, cooldown, answer cache and bounded prompt/output.
- Treat model output as untrusted advice; all Spotify actions remain in the existing authenticated DJ workflows.

There is no separate structured proposal registry yet. Plain-text conversation history currently supplies follow-up context such as “maak die lijst commerciëler” or “vervang nummer vier”. Add stable proposal IDs only if real use shows that this is insufficient.

## Reconciliation decisions

1. Start from the exact current `main` commit and work on `refactor/architecture-mainline`.
2. Do not merge or cherry-pick the architecture-foundation branch wholesale: its AI context/tool model includes Spotify-derived queue/catalogue information that conflicts with the current privacy boundary.
3. Preserve useful modularization and tests already present in mainline.
4. Correct stale documentation that described production as disposable test infrastructure or described the AI as having Spotify queue/catalogue tools.
5. Reimplement conversational follow-ups using DJ/AI text history only; keep Spotify search and track insertion as separate DJ-initiated actions.
6. Validate the full migration chain against an empty local D1 database in CI before any remote migration.
7. Keep PR #15 in draft until review and validation are complete.

## Release sequence

1. Complete source review and PR CI: TypeScript, architecture boundaries, all unit/security tests, local AI bridge contract, local D1 migrations, test/production Worker dry-runs and browser journeys/screenshots.
2. Review the exact migration `0004` and confirm the production migration ledger still ends at `0003`.
3. Obtain explicit release approval before merging to `main` or triggering any production build.
4. Apply migrations and deploy only through the guarded production release path; do not manually reset or recreate production resources.
5. Verify health, DJ login, Spotify OAuth/playback, AI conversation persistence and scheduled retention after release.
6. Record the deployed Worker version, deployment ID and migration ledger in `docs/runbooks/PRODUCTION-READINESS.md`.

A green PR dry-run is not a production deployment and does not apply a remote D1 migration.

## Remaining focused work

- Finish PR #15 validation and review.
- Confirm follow-up intent handling still imports a prior AI-generated list only from the AI answer, never from Spotify result DOM text.
- Keep tests for session/event isolation, eight-turn cap, seven-day retention, migration SQL and strict Spotify-data exclusion.
- Consider typed outcomes for the remaining HTTP-shaped use cases only when a focused change is justified.
- Avoid further architecture expansion that does not directly improve correctness, security, testability or release readiness.
