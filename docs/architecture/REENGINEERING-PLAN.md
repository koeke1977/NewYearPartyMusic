# Architecture Reengineering Plan

## Status

- Repository: `koeke1977/NewYearPartyMusic`
- Baseline main SHA: `753464e6c57531a4e5ba187afd86815490adb7a8`
- Working branch: `refactor/architecture-foundation`
- Scope: architecture reengineering of the current test application
- The deployed Cloudflare Worker and D1 are test resources only. The application has not been used for a real event or real production users; current database rows and Spotify OAuth state are test data and may be reset or recreated when that is the best engineering choice.

## Current implementation progress

The current branch has completed the initial Worker route composition and the first feature-scoped frontend CSS extraction. System health/config routes and scheduled cleanup have dedicated adapters; the Worker entrypoint is now a composition root. DJ route authorization is centralized and characterized across all protected feature endpoints. The shared stylesheet is limited to shared foundations, and DJ presentation is split into layout, playback, request-search, queue and AI files. These are migration milestones, not a claim that the full architecture is finished.

The first security/platform extraction has been implemented on `refactor/architecture-foundation`:

- `apps/worker/src/platform/env.ts`: Worker binding contract.
- `apps/worker/src/platform/security/crypto.ts`: SHA-256, HMAC signing, base64url, constant-time comparison and AES-GCM encryption/decryption.
- `apps/worker/src/modules/identity/session-token.ts`: signed bearer-token creation and validation.
- `apps/worker/src/index.ts`: now consumes these modules instead of owning those implementations.

Compatibility tests verify that session tokens from the old implementation remain accepted and that Spotify OAuth tokens encrypted by either the old or new implementation remain decryptable. Tests also cover tampering, expiry, wrong secrets, malformed tokens, catalogue token caching/API request construction, and DJ assistant prompt rules/context.

The GitHub Actions validation run has passed:
- TypeScript strict typecheck.
- Security compatibility tests.
- Cloudflare Worker bundle dry-run.

The current Worker, frontend and AI responsibility maps are documented in `WORKER-RESPONSIBILITY-MAP.md`, `FRONTEND-RESPONSIBILITY-MAP.md` and `AI-RESPONSIBILITY-MAP.md`. System, guest, DJ identity, AI, DJ request management and Spotify playback endpoints are grouped into dedicated Hono route modules. Shared event-scoped DJ authorization is applied as route middleware. Scheduled cleanup and QueueRoom are isolated from the composition root.

The Worker composition root now mounts dedicated system, guest, DJ identity, AI, request and playback route groups. Scheduled cleanup and the QueueRoom Durable Object also have dedicated owners. DJ feature routes use shared event-scoped session middleware. The remaining backend work is deeper boundary hardening, route/use-case contract characterization and integration seams rather than moving these HTTP handlers out of the entrypoint. No production deployment or D1 mutation was performed.

## Executive summary

The following measurements describe the **original pre-extraction baseline**, not the current branch. They are retained as historical context only. The implementation has since moved the Worker routes, DJ UI behaviour and page-specific CSS into dedicated modules and files.

| Area | Original baseline | Current architectural position |
|---|---|---|
| Worker | `apps/worker/src/index.ts`, ~66.5 KB / 860 lines | Composition root mounting system, guest, DJ identity, AI, request and playback route groups |
| DJ UI | `apps/web/dj.js`, ~36 KB | Small page composition root; behaviour is distributed across native ES modules |
| CSS | `apps/web/styles.css`, ~58.8 KB | Shared foundations plus guest and five DJ feature stylesheets; see the selector inventory for historical extraction measurements |
| HTML | `apps/web/dj.html`, ~9 KB | Semantic page structure and stable hooks; behaviour loads through external native ES modules |
| Documentation | Original architecture/development notes | Responsibility maps are maintained in `docs/architecture/`; this plan records target boundaries and remaining work |

The application should remain a modular monolith on Cloudflare Workers, not be split into microservices without a concrete operational need. The Worker application layer now uses application-owned repository/provider ports across the guest/request, DJ queue, music catalogue, AI, queue dispatch and playback workflows. A CI dependency-boundary check enforces Worker application/domain/identity dependencies and browser transport/storage ownership, including no direct Spotify API calls or inline HTML presentation/behaviour. The remaining architecture cleanup includes replacing HTTP-shaped application results with typed use-case outcomes, while routes retain status/body mapping. Continue targeted composition review and frontend interaction coverage. Edge throttling remains a future public-event operational requirement, not a blocker for current test development.

## Environment assumptions

The current Cloudflare Worker, D1 database and Spotify OAuth connection are used exclusively for development and testing. PartyQueue has not yet served a real event or real production users. The existing D1 rows and OAuth state are test data, not business-critical production records.

Engineering decisions must therefore optimize for a clean, correct architecture rather than preserving accidental test state. It is acceptable to reset or recreate the test D1 database, regenerate test credentials, reconnect the test Spotify account or redeploy the test Worker when useful. Do not add compatibility layers solely to preserve disposable test data.

Keep normal security and quality controls: never commit secrets, keep Spotify credentials server-side, test migrations before applying them, and preserve authorization and AI/DJ permission boundaries. A future real public event release is a separate operational decision; it must not block current architecture work.

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
- Record the current branch baseline and identify the disposable Cloudflare test resources.
- Add this architectural plan.
- Capture current route/API behaviour and data schema.
- Establish tests and validation scripts before moving code.
- Treat the current Worker, D1 and Spotify connection as test resources that may be reset or reconfigured as required.

### Phase 1 — characterization tests and contracts
- Add a Workers-compatible test runner (evaluate Vitest with the Cloudflare Workers pool against current compatibility).
- Test session signing/validation, request limits, state transitions, ordering, Spotify response handling and AI proposal validation.
- Define typed request/response contracts for every current API endpoint.
- Use fixtures; do not make real Spotify calls in unit tests.

### Phase 2 — Worker extraction without behaviour changes
Extract in small batches: environment/types; crypto/session utilities; D1 repositories; Spotify API/token adapter; guest/request application services; queue/playback services; AI orchestration/modules; route files; scheduled handler and Durable Object.
Keep URL paths, response shapes, status codes, auth semantics and existing behaviour unchanged unless a separately tested bug fix is approved.

### Phase 3 — DJ frontend extraction

Current branch status: DJ page entrypoint, API/auth/session, polling, overview, moderation, queue, playback and AI behaviour are already separated into native ES modules. Continue with dependency-boundary verification, state ownership review and characterization coverage rather than recreating modules that already exist.
- Extract an API client and session/auth controller first.
- Split polling, overview, request moderation, queue reorder, Spotify controls and AI assistant into feature modules.
- Separate view rendering from event binding and network operations.
- Convert entrypoints to ES module scripts.
- Preserve DOM IDs during incremental migration or provide explicit compatibility adapters.

### Phase 4 — CSS and HTML ownership cleanup

Current branch status: token/base/shared/guest layers exist; DJ-only styles are now split into five ordered feature stylesheets. Continue with selector ownership validation, duplicate/unused rule review and accessibility checks. The split is not complete until the browser visual baselines remain green.
- Inventory selectors, duplicate declarations, specificity conflicts and unused styles.
- Introduce design tokens and predictable component/feature scopes.
- Split CSS by responsibility without unintentionally changing visual design.
- Keep accessibility, keyboard support and mobile behaviour.

### Phase 5 — hardening and deployment
- Typecheck, lint, unit, integration and browser tests.
- Compare API contract snapshots against the baseline.
- Validate D1 migrations against a disposable local/test database.
- Prepare backup/export and rollback instructions.
- Validate deployment configuration for the test environment; a future real public event release is handled separately.

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
- Test data and test credentials may be recreated; secrets must still never be committed or exposed.

## Out of scope unless separately approved

- Replacing Hono, Cloudflare Workers, D1 or Spotify.
- Introducing a frontend framework solely for fashion.
- Microservices.
- Changing the user experience or visual language.
- Multi-event administration.
- Real public event launch or external customer rollout.

## Required next deliverables

1. Verified route/API inventory with methods, auth rules and response contracts.
2. Complete module/file responsibility map based on source code.
3. Characterization test plan for current behaviour.
4. Sequenced extraction plan with file-level changes.
5. ADRs for non-obvious architecture decisions.

The implementation agent must not claim the app is architecturally complete merely because files have been moved. Verify the result with tests and dependency checks.
## Follow-up boundary audit — 2026-11-20

The route/use-case/integration split is materially improved, but it is not yet a fully dependency-inverted architecture. The current implementation audit identified these remaining items:

- `modules/requests/application/guest-request-lifecycle.ts` now owns the `GuestRequestTrack` DTO and `GuestRequestTrackGateway` contract. The composition adapter maps Spotify HTTP responses into that contract; application workflows no longer import Spotify integration types or consume Fetch `Response` objects. Non-success Spotify responses still map to the existing guest/DJ error results, while malformed successful payloads fail closed. Broader repository ports and D1 dependency inversion remain outstanding.
- `modules/requests/application/*`, `modules/ai/application/*` and playback use cases still receive D1 bindings or concrete infrastructure functions in several paths. Repository ports and composition wiring are not yet consistently enforced across all features.
- `modules/playback/application/get-dj-spotify-playback-status.ts` coordinates external HTTP response parsing and side-effecting playback automation. This remains a deliberate compatibility seam pending a typed Spotify gateway contract and characterization of the 204/no-device and fallback paths.
- `apps/web/modules/dj-ai-assistant.js` owns prompt submission, intent-specific orchestration, proposal confirmation, suggestion selection, DOM rendering and sequential queue writes. It needs a controller/use-case boundary and smaller view modules; preserve the explicit DJ confirmation before queue reorder and the existing per-track failure reporting.
- `apps/web/modules/dj-spotify-console.js` combines Spotify UI rendering, polling response mapping, control event binding and volume-write coordination. State sequencing is already isolated in playback modules, but presentation and controller responsibilities remain mixed.

### Completed in this audit pass

- Moved the Spotify playback workflow adapter out of `routes/` into `platform/composition/`, where Cloudflare bindings and concrete Spotify/repository adapters are wired to application use cases. The Hono route now imports this composition adapter instead of owning a workflow-named module under the HTTP route directory.
- The route remains a transport adapter; no endpoint, response payload, Spotify command, queue policy, D1 query, or OAuth behavior was intentionally changed.

### Remaining acceptance work

- Introduce application-owned provider DTOs and repository ports before removing concrete D1/Fetch dependencies.
- Split DJ AI and Spotify console browser controllers from pure DOM views, with interaction tests for cancellation, reorder confirmation, stale polling and partial Spotify failures.
- Add automated dependency-boundary checks once the ports are in place; avoid brittle path-only rules that would merely bless current violations.
- Run the complete Worker and browser regression workflows on the final head before considering this PR ready for review.

This audit is intentionally explicit about remaining mixed boundaries. Green CI verifies the current behavior and type/test suite; it does not by itself certify that all target architecture rules have been achieved.

### Follow-up: guest and DJ catalogue composition

- Moves Cloudflare environment wiring for guest join, guest request submission, guest/DJ Spotify catalogue search and DJ AI track insertion into `platform/composition/guest-workflows.ts`.
- Guest and DJ Hono route modules now retain request parsing, session checks, identifier validation and HTTP response serialization; they no longer construct D1/Spotify dependencies for these workflows.
- Existing application use cases, D1 repository calls, Spotify catalogue endpoints, event scoping, rate limits, duplicate checks and request status policy are unchanged.
- At that point this was a composition-boundary improvement. The subsequent typed request/catalogue ports documented below supersede the then-open provider/repository dependency work.



### Follow-up: typed playback gateway and DJ console ownership — 2026-11-20

- Added an application-owned SpotifyPlaybackGateway contract with typed current-playback and queue results. The playback application no longer consumes Fetch Response objects or Spotify wire DTOs.
- Added integrations/spotify/playback-status-gateway.ts to own Spotify HTTP paths, wire DTO parsing, normalization and the special HTTP 204/no-active-device result.
- Kept the existing /api/dj/spotify/status response contract, including the existing no-device, fallback, auto-advance, queue-preview and error semantics. Characterization tests cover these branches without making real Spotify requests.
- Extracted modules/dj-ai-actions.js: sequential suggestion additions, duplicate handling, per-track failures and complete queue-permutation validation now live outside the AI DOM controller. Reordering still requires explicit DJ confirmation.
- Extracted modules/dj-spotify-console-view.js: DOM-only Spotify console rendering now owns status, device, track, volume, progress, transport-button, fallback-preview and offline presentation. The console controller retains API calls, stale-response coordination, volume-write sequencing and event binding.
- Added focused unit coverage for the AI action workflows and the typed Spotify gateway. The existing console controller tests exercise the extracted view through its public integration.
- The current Cloudflare Worker and D1 are test-only. Test data, test OAuth state and test resources may be reset or recreated when needed; this is not a live production system.


### Follow-up: queue dispatch persistence port — 2026-11-20

- Introduced an application-owned QueueDispatchRepository contract for the critical NEXT workflow: acquire/release lease, list queued tracks, read saved order, conditionally mark played, clear fallback state and persist last-track state.
- Moved D1-specific SQL behind queue-dispatch-d1-repository.ts and wired it in platform/composition/dj-playback-workflows.ts.
- dispatch-next-track.ts now depends on the repository port and Spotify playback callback only. It no longer imports D1 types or infrastructure functions.
- Reworked dispatch characterization tests to use a fake application port. They verify lock contention, empty queue, saved ordering, successful side-effect order, Spotify rejection and concurrent state change without D1 or real Spotify.
- The lock lease, 30-second expiry, queue order, HTTP success criteria, request state transition and playback state persistence remain unchanged.


### Follow-up: application-owned Spotify catalogue and playback-control ports — 2026-11-20

- The guest/DJ catalogue use cases now depend on an application-owned `SpotifyCatalogSearchGateway` and normalized `CatalogTrack` DTO. The Worker application layer no longer imports Spotify wire types or consumes Fetch `Response` objects for catalogue search.
- Spotify response parsing, required-field validation and HTTP status normalization are owned by `integrations/spotify/catalog-api.ts`.
- DJ playback device, volume and transport use cases now depend on `SpotifyPlaybackControlGateway`; `integrations/spotify/playback-control-gateway.ts` owns Spotify HTTP response parsing and error-body truncation.
- Existing API response shapes and user-visible behaviour are preserved, including Spotify rate-limit mapping, device field names, 204 command success and 400-character command error detail.
- Focused tests cover both application ports and integration adapters.
- Remaining dependency-boundary work should be driven by a fresh source audit; do not repeat extractions already completed in request, queue dispatch, AI and playback status modules.


### Current architecture checkpoint — 2026-11-20

The latest source audit confirms that Worker application modules and identity policies no longer import concrete infrastructure, integration, platform or route modules and do not use D1 bindings or Fetch `Response` objects directly. This is now enforced by `scripts/check-architecture-boundaries.mjs` in the pull-request CI workflow.

Application-owned ports cover guest request persistence and Spotify track lookup, DJ queue persistence, request retention, AI context/cache/budget persistence, queue dispatch, playback automation/status/control and Spotify catalogue search. Cloudflare D1 and Spotify HTTP details are wired only in infrastructure/integration composition.

The DJ AI workflow has also been split: `dj-ai-assistant.js` owns API/workflow orchestration, `dj-ai-assistant-view.js` owns DOM rendering and confirmation UI, and `dj-ai-actions.js` owns queue/track mutation policy. Explicit DJ confirmation and sequential per-track failure reporting remain covered.

The current Cloudflare Worker, D1 and Spotify OAuth state are test-only and disposable. The unused `event_code_hash` column and placeholder were removed from `db/schema.sql`; event-code verification uses the Worker secret. `npm run deploy` targets the default test environment; `npm run deploy:production` is a separate guarded path for any future real-event release. This future release path is not a prerequisite for current engineering.


### Follow-up: normalized individual Spotify track lookup — 2026-11-20

- Added the shared `modules/music/domain/catalog-track.ts` DTO for normalized catalogue tracks.
- The Spotify integration adapter now owns wire parsing for both search and individual track lookup.
- Guest request submission and DJ track insertion consume that DTO through the request-owned track gateway; composition only wires the adapter and D1 repository.
- Updated request lifecycle and Spotify adapter tests for normalized artist arrays, album images, missing tracks and malformed provider payloads.


## Follow-up: atomic request concurrency controls — 2026-11-20

The request lifecycle now protects two concurrency-sensitive state changes at the D1 boundary:

1. **One active request per track/event.** The bootstrap schema defines a partial unique index over `(event_id, spotify_track_id)` while the request is `pending`, `approved` or `queued`. Guest and DJ inserts use conflict-safe `INSERT OR IGNORE`; the application maps the conflict to the existing guest 409 response or DJ `alreadyQueued` response. Terminal states release the index key.
2. **DJ moderation state transitions.** The repository updates a request only when its current status is one of the transition's allowed source states. A concurrent stale action changes zero rows and returns a conflict rather than overwriting the winning action.

The new regressions cover both races. Full CI run [44777146224](https://github.com/koeke1977/NewYearPartyMusic/actions/runs/44777146224) passed on commit `0cf0cbc979e759d584ca20dfee71e8dc7d664cb6`.


## Follow-up: atomic request and queue concurrency — 2026-11-20

The request/queue persistence boundary now enforces concurrency-sensitive invariants in single D1 statements:

- **Active-track uniqueness:** a partial unique index on `(event_id, spotify_track_id)` applies to `pending`, `approved` and `queued`. Conflict-safe inserts preserve guest 409 and DJ `alreadyQueued` behavior; terminal states free the track.
- **Guest quotas:** the open-request count and rolling 30-minute count are checked in the same `INSERT ... SELECT` that creates the guest request. The earlier reads remain as fast prechecks and provide clear error messages, while the database predicate closes the race.
- **Moderation:** state changes include the expected previous state in the `UPDATE` predicate; a stale concurrent action updates zero rows and returns 409.
- **Queue ordering:** adding a DJ track appends its ID using one SQLite JSON upsert rather than reading and rewriting the entire array. Concurrent additions no longer lose each other's order entries.
- **Guest join:** the session token is signed before inserting the guest row, so a signing failure cannot leave an orphan record.

The regressions and the complete CI run [44778527531](https://github.com/koeke1977/NewYearPartyMusic/actions/runs/44778527531) passed on `b377906e0a6f3fdcdc5f296874762bbb592825a8`.

### Next architecture boundary

A few Worker application use cases still return `{ status, body }` structures. The next cleanup should replace these HTTP-shaped results with typed application outcomes and leave HTTP status/body mapping in the route adapters, without changing any public API response.
