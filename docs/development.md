# Development workflow

This document describes the current development workflow. The binding rules are in [the engineering standard](architecture/ENGINEERING-STANDARD.md); production operations are in [the production runbook](runbooks/PRODUCTION-READINESS.md).

## Requirements

- Node.js 22
- npm
- Wrangler authentication for Cloudflare tasks
- Chromium installed by Playwright for browser journeys

## Local setup and validation

```bash
npm install
npm run dev
npm run typecheck
npm run test:architecture
npm test
npm run test:local-ai-bridge
npm run db:migrate:local
npm run test:browser
npm run screenshots:baseline
```

For a disposable local D1 database, `npm run db:local` loads the bootstrap schema. `npm run db:migrate:local` applies the ordered migrations to a local database. These commands do not target production.

## Current application capabilities

- Guest join with event code and nickname/session.
- Spotify catalogue search and event-scoped requests with duplicate and rolling-rate protection.
- DJ authentication, request moderation, queue ordering and Spotify playback workflows.
- Guest music preferences and event-level Audience Intelligence.
- Crowd feedback with eligibility/sample safeguards.
- Authenticated FLUSH for temporary event data; application-wide taxonomy and configuration are preserved.
- AI advice with bounded live PartyQueue and aggregate audience context.
- Explicit DJ add/remove/reorder action plans, validated and executed by the Worker through existing application workflows.
- Optional Autopilot, OFF by default and add-only, with queue thresholds, per-tick limits, cooldown, D1 lease, STOP verification and free daily Neuron budget guard.
- Local Claude Code bridge when configured; otherwise Cloudflare Workers AI. No paid API fallback is part of the approved operating model.

## Branch and pull-request workflow

- Keep exactly two branches at most: `main` and one active feature/fix branch.
- Reuse the existing feature branch for follow-up work. Do not create parallel documentation, fix or test branches.
- Keep related code, tests and documentation in the same focused change.
- A draft PR is not ready to merge. Review the complete diff and require all relevant CI/browser checks to pass before merge.
- Production deployment is separate from PR validation and merge. It requires a manual workflow dispatch from `main`, explicit `YES` approval and the configured GitHub `production` Environment reviewer gate.
- Never force-push, reset away unreviewed work or delete a branch until its unique commits and open PRs have been checked.

## Environment safety

- Local D1 and explicitly identified test resources may be reset when needed.
- Production Worker, D1, Durable Objects, hostname, secrets, Spotify OAuth state and event data are live infrastructure.
- Never infer production migration state from local schema files. Inspect the remote migration ledger immediately before an approved release.
- Never commit credentials, access codes, tokens, cookies or secrets.
- Read the production runbook before any production operation.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local Worker |
| `npm run typecheck` | TypeScript validation |
| `npm run test:architecture` | Enforce dependency and ownership boundaries |
| `npm test` | Run unit/security tests |
| `npm run test:local-ai-bridge` | Validate the local AI bridge contract |
| `npm run db:migrate:local` | Apply migrations to local D1 |
| `npm run test:browser` | Run guest/DJ browser journeys |
| `npm run screenshots:baseline` | Capture visual baselines |
| `npm run release:preflight` | Run static production release checks |
| `npm run deploy` | Deploy the test Worker |
| `npm run deploy:production` | Guarded production deploy; use only through the approved release workflow |

A command being available does not constitute approval to run it against production.
