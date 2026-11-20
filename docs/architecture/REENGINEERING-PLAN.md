# Architecture Reengineering Plan

## Status

- Repository: `koeke1977/NewYearPartyMusic`
- Baseline main SHA: `753464e6c57531a4e5ba187afd86815490adb7a8`
- Working branch: `refactor/architecture-foundation`
- Scope: architecture audit and safe migration foundation
- Production Worker and D1 are explicitly out of scope for direct modification during this phase.

## Current implementation progress

The first security/platform extraction has been implemented on `refactor/architecture-foundation`:

- `apps/worker/src/platform/env.ts`: Worker binding contract.
- `apps/worker/src/platform/security/crypto.ts`: SHA-256, HMAC signing, base64url, constant-time comparison and AES-GCM encryption/decryption.
- `apps/worker/src/modules/identity/session-token.ts`: signed bearer-token creation and validation.
- `apps/worker/src/index.ts`: now consumes these modules instead of owning those implementations.

Compatibility tests verify that session tokens from the old implementation remain accepted and that Spotify OAuth tokens encrypted by either the old or new implementation remain decryptable. Tests also cover tampering, expiry, wrong secrets, malformed tokens, catalogue token caching and catalogue API request construction.

The GitHub Actions validation run has passed:
- TypeScript strict typecheck.
- Security compatibility tests.
- Cloudflare Worker bundle dry-run.

The current Worker and frontend responsibility maps are documented in `WORKER-RESPONSIBILITY-MAP.md` and `FRONTEND-RESPONSIBILITY-MAP.md`.

This is the first vertical slice only. The remaining Worker routes, D1 access, Spotify integration, queue/playback orchestration and AI endpoint are still in the original entrypoint and remain scheduled for later extraction. No production deployment or D1 mutation was performed.

## Executive summary

The current application is a Cloudflare Workers + Hono + D1 single-event Spotify request/DJ application. Its functional scope has grown beyond the original repository documentation. The largest architectural risks are concentrated entrypoints and mixed responsibilities:

| Area | Current file | Observed size | Concern |
|---|---|---:|---|
| Worker | `apps/worker/src/index.ts` | ~66.5 KB / 860 lines | HTTP routing, session security, Spotify token lifecycle, OAuth, AI endpoints, moderation, queue orchestration, D1 queries, cron cleanup and Durable Object class in one module |
| DJ UI | `apps/web/dj.js` | ~36 KB | Authentication, API client, polling, Spotify playback controls, queue management, AI actions, state and DOM rendering together |
| CSS | `apps/web/styles.css` | ~58.8 KB | Global style ownership likely mixed across guest and DJ surfaces; requires selector inventory before splitting |
| HTML | `apps/web/dj.html` | ~9 KB | DJ layout contains multiple complex functional areas; retain semantic markup while moving behaviour into isolated modules |
| Documentation | `docs/architecture.md`, `docs/development.md` | small | Documentation does not reflect the current implementation |

The application should remain a modular monolith on Cloudflare Workers, not be split into microservices without a concrete operational need.

## Production safety findings

Cloudflare account connection confirmed. Existing production resources observed:

- Worker: `partyqueue` (recently modified 2026-11-20)
- D1 database: `partyqueue-db`
- D1 database ID: `d627ba29-4d77-4ddd-a115-19022685f5c1`
- Production D1 row counts: `events` 1, `guests` 15, `requests` 222, `settings` 13, `spotify_auth` 1.

**Critical:** this is live application data, including Spotify authentication state. Never drop/recreate tables, reset settings, replace OAuth data, or deploy a changed Worker as part of an unverified refactor. No production resources were modified during this audit.

## Target architecture

Use a modular monolith with explicit inward dependencies:

```text
apps/
  web/
    guest/
      pages/
      components/
      features/ (join, search, requests, queue-status)
    dj/
      pages/
      components/
      features/ (authentication, overview, requests, queue, playback, ai-assistant)
      state/
    shared/ (api, components, styles, utils)
  worker/
    src/
      index.ts                 # composition root only
      app.ts                   # Hono app assembly
      routes/                  # health, config, guest, requests, DJ, Spotify, AI
      modules/
        identity/               # session and DJ identity
        guests/                 # guest registration
        requests/               # request lifecycle
        moderation/              # request policy and overrides
        queue/                   # ordering, serialization, dispatch
        playback/                # playback state and controls
        spotify/                 # OAuth, tokens, catalogue and API adapter
        ai/
          contracts/
          orchestration/
          context/
          memory/
          prompts/
          providers/
          modules/               # party-advisor, queue-optimizer, starter-list, queue-fill
      platform/                  # D1, crypto, HTTP, logging, clock, bindings
      scheduled/                 # cleanup handler
      durable-objects/           # QueueRoom
packages/
  contracts/                     # shared schemas/DTOs only when genuinely shared
docs/
  architecture/
  adr/
  runbooks/
db/
  migrations/
```

These are logical ownership boundaries, not a mandate to create empty folders. Create modules only when they own real behaviour.

## Dependency rules

1. Routes are transport adapters: parse, validate, authenticate, call one application use case, map result to HTTP.
2. Application services orchestrate use cases and depend on domain contracts, not Hono, D1 or Spotify implementation details.
3. Domain code contains business rules and typed concepts; it must not import Cloudflare, Hono, DOM or provider implementations.
4. Infrastructure implements repository, clock, token-store, AI-provider and Spotify-gateway contracts.
5. The composition root wires concrete implementations.
6. AI modules return typed proposals; they do not directly mutate D1 or call Spotify playback endpoints.
7. Queue and playback application services own the authorization/validation path for state transitions and external dispatch.
8. No circular imports. Shared modules contain stable primitives/contracts only, never a generic dumping ground.
9. Avoid interfaces with only one implementation unless they create a useful boundary, test seam or provider swap point.
10. Feature modules expose small public interfaces; other features must not import their internal files.

## Backend ownership boundaries

| Capability | Owner | Not responsible for |
|---|---|---|
| Guest identity/session | Identity module | Spotify tokens, queue order |
| Track search | Spotify catalogue adapter + search use case | DJ UI rendering |
| Request lifecycle | Requests module | Raw HTTP request parsing |
| Moderation policy | Moderation module | Spotify playback |
| Queue ordering/dispatch | Queue module | DOM state, AI prompt text |
| Spotify OAuth/token refresh | Spotify integration | AI decisions, guest sessions |
| Playback control/state | Playback module using Spotify gateway | Queue database ownership |
| AI advice/proposals | AI modules | Direct privileged mutations |
| Scheduled cleanup | Scheduled handler calling application use case | Route handlers |

## AI architecture

AI must be explicit, replaceable, observable and bounded.

- `AiOrchestrator`: selects and calls a named AI use case.
- `AiProvider`: provider adapter; Cloudflare Workers AI is the initial provider where available and within the applicable free allowance.
- `PromptCatalog`: versioned prompt templates separate from business logic.
- `ContextAssembler`: builds a minimal, typed and privacy-aware snapshot of queue, playback and session context.
- `MemoryRepository`: persists approved, useful preferences/patterns with defined retention and deletion.
- `AiPolicy`: validates output, permitted actions, limits and safety.
- `AiResultEvaluator`: records outcome/feedback for evaluation; do not claim model training or learning unless an actual persistent mechanism exists.

Initial independent use cases: `party-advisor`, `queue-optimizer`, `starter-list`, `queue-fill`.

Use deterministic code for limits, duplicate detection, eligibility, permissions, request lifecycle and playback commands. AI proposals require explicit DJ confirmation. ChatGPT is an optional external second-opinion workflow, not a hidden runtime dependency.

## Frontend boundaries

- HTML owns semantic structure and accessible controls only.
- CSS owns presentation. Split by global tokens/base, shared components, guest feature styles and DJ feature styles after auditing selectors and load order.
- JavaScript ES modules own one feature each.
- A small API client owns fetch, auth headers, JSON parsing and normalized errors.
- Feature controllers own user actions and call application-facing API methods.
- View/render modules own DOM updates and must not perform network requests.
- A single explicit state model owns mutable UI state; avoid ad-hoc global variables.
- Polling/subscription lifecycle is encapsulated and cleaned up on logout.
- No direct Spotify API requests from the browser.

## First migration sequence

### Phase 0 — baseline and safety (this branch)
- Record current main SHA and production resources.
- Add this architectural plan.
- Capture current route/API behaviour and data schema.
- Establish tests and validation scripts before moving code.
- Do not touch production D1 data, secrets, bindings or Worker deployment.

### Phase 1 — characterization tests and contracts
- Add a Workers-compatible test runner (evaluate Vitest with the Cloudflare Workers pool against current compatibility).
- Test session signing/validation, request limits, state transitions, ordering, Spotify response handling and AI proposal validation.
- Define typed request/response contracts for every current API endpoint.
- Use fixtures; do not make real Spotify calls in unit tests.

### Phase 2 — Worker extraction without behaviour changes
Extract in small batches: environment/types; crypto/session utilities; D1 repositories; Spotify API/token adapter; guest/request application services; queue/playback services; AI orchestration/modules; route files; scheduled handler and Durable Object.
Keep URL paths, response shapes, status codes, auth semantics and existing behaviour unchanged unless a separately tested bug fix is approved.

### Phase 3 — DJ frontend extraction
- Extract an API client and session/auth controller first.
- Split polling, overview, request moderation, queue reorder, Spotify controls and AI assistant into feature modules.
- Separate view rendering from event binding and network operations.
- Convert entrypoints to ES module scripts.
- Preserve DOM IDs during incremental migration or provide explicit compatibility adapters.

### Phase 4 — CSS and HTML ownership cleanup
- Inventory selectors, duplicate declarations, specificity conflicts and unused styles.
- Introduce design tokens and predictable component/feature scopes.
- Split CSS by responsibility without unintentionally changing visual design.
- Keep accessibility, keyboard support and mobile behaviour.

### Phase 5 — hardening and deployment
- Typecheck, lint, unit, integration and browser tests.
- Compare API contract snapshots against the baseline.
- Validate D1 migrations against a disposable local database and a production-like clone.
- Prepare backup/export and rollback instructions.
- Deploy only through a separately reviewed release PR after explicit production approval.

## Required engineering controls

- TypeScript strict mode for Worker code.
- Frontend JavaScript as ES modules; migrate to TypeScript only where it reduces risk and improves contracts.
- ESLint + Prettier.
- Vitest or another Workers-compatible test environment.
- Zod or an equivalent runtime schema validator at API boundaries.
- Avoid `any`; isolate unavoidable untyped provider data at adapter boundaries.
- Structured, redacted logging. Never log access/refresh tokens, codes, cookies or secrets.
- Centralized API error mapping with stable client-safe messages.
- Database migrations are additive where possible and include rollback/recovery notes.
- No unbounded retry loops or duplicate Spotify side effects.
- Idempotency/concurrency protection for queue dispatch must be tested under contention.
- Avoid paid services or new Cloudflare products unless a concrete requirement justifies them.

## Acceptance criteria

A phase is complete only when:
- All existing end-user and DJ capabilities still work.
- API paths, response contracts and authentication behaviour are preserved.
- No module has multiple unrelated reasons to change.
- No circular dependencies exist.
- No route contains domain/business logic or raw multi-step SQL orchestration.
- No UI component performs API/Spotify/AI integration directly.
- AI cannot bypass DJ confirmation or application permissions.
- Tests cover happy paths, invalid input, provider failures and concurrency edges.
- Typecheck, lint and tests pass.
- Documentation reflects actual code.
- Production data and secrets remain unchanged unless an approved migration explicitly requires otherwise.

## Out of scope unless separately approved

- Replacing Hono, Cloudflare Workers, D1 or Spotify.
- Introducing a frontend framework solely for fashion.
- Microservices.
- Changing the user experience or visual language.
- Multi-event administration.
- Production database reset, destructive schema change, token reset or deployment.

## Required next deliverables

1. Verified route/API inventory with methods, auth rules and response contracts.
2. Complete module/file responsibility map based on source code.
3. Characterization test plan for current behaviour.
4. Sequenced extraction plan with file-level changes.
5. ADRs for non-obvious architecture decisions.

The implementation agent must not claim the app is architecturally complete merely because files have been moved. Verify the result with tests and dependency checks.