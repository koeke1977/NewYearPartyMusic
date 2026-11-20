# Development checklist

This checklist describes the current application and the next safe engineering steps. Do not treat completed features as unimplemented simply because an older checklist said so.

## Current baseline

- [x] Single-event scope and production hostname documented
- [x] Cloudflare Worker + Hono application deployed
- [x] Cloudflare D1 schema and production data present
- [x] Guest registration and session handling
- [x] Spotify catalogue search
- [x] Music request submission and request limits
- [x] DJ authentication and dashboard
- [x] Request moderation and queue management
- [x] Spotify OAuth, token persistence and playback controls
- [x] DJ#DATUUR AI assistant endpoints and UI

## Architecture reengineering

- [x] Create isolated branch for architecture work
- [x] Record repository and production baseline
- [x] Document target modular-monolith architecture
- [x] Record production data safety constraints
- [x] Inventory every API route, method, auth rule and response contract
- [ ] Map each existing function/file to a single responsibility
- [ ] Add and pass characterization tests before moving further implementation code (initial crypto/session compatibility tests added)
- [x] Extract Worker environment type, cryptographic primitives and session-token service
- [ ] Extract D1 repositories and application use cases
- [ ] Extract Spotify OAuth/token/API adapter
- [ ] Extract queue and playback services
- [ ] Split AI orchestration, providers, context, memory, prompts and use cases
- [ ] Split Hono routes into transport-only modules
- [ ] Split DJ frontend API/auth/state/polling/features/rendering
- [ ] Inventory and split CSS by actual selector ownership
- [x] Add CI typecheck, security-test and Cloudflare Worker dry-run workflow (lint/dependency-boundary checks remain)
- [ ] Validate database migrations on disposable data
- [ ] Prepare production backup/export and rollback runbook
- [ ] Open reviewed release PR before any production deployment

## Initial extraction delivered

- `apps/worker/src/platform/env.ts` owns Worker binding types.
- `apps/worker/src/platform/security/crypto.ts` owns SHA-256, HMAC, base64url, constant-time comparison and AES-GCM token encryption.
- `apps/worker/src/modules/identity/session-token.ts` owns signed bearer-session creation and validation.
- The existing Worker entrypoint now consumes those modules; API paths and token/encryption formats are intentionally unchanged.
- Vitest security compatibility tests cover legacy session tokens and legacy encrypted Spotify-token compatibility.

## Change safety requirements

- Preserve existing API URLs, request/response shapes, auth semantics and user experience unless a separately approved change is covered by tests.
- Never reset, drop or recreate production D1 tables as part of refactoring.
- Never overwrite or reset the existing Spotify OAuth record or secrets.
- Do not deploy to the production Worker from this architecture branch.
- Use a disposable local/test database for migration development.
- Each extraction step must pass typecheck and relevant tests before proceeding.

See [architecture/REENGINEERING-PLAN.md](architecture/REENGINEERING-PLAN.md) for the detailed design and acceptance criteria.
