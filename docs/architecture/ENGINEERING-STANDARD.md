# NewYearPartyMusic Engineering Standard (NPES)

**Status:** Binding engineering standard for new and refactored code
**Applies to:** apps/web, apps/worker, shared contracts, tests and tooling
**Purpose:** Preserve existing behaviour while establishing explicit ownership, separation of concerns and maintainable module boundaries.

This standard complements REENGINEERING-PLAN.md, the responsibility maps and the API inventory. It does not authorize a framework migration, an untested behaviour change, destructive production-data operations or a production deployment.

## 1. Non-negotiable principles

1. Preserve existing user-visible behaviour, API routes, payloads, response shapes, authentication, storage formats and operational safeguards unless a separately reviewed change explicitly authorizes a change.
2. One file has one primary responsibility and one clear owner.
3. Keep dependencies explicit and directed. No circular imports, hidden globals or cross-feature imports of private implementation files.
4. Prefer cohesive modules over arbitrary file splitting. Do not split code merely to hit a line count.
5. Make the smallest safe change that advances the architecture.
6. Add or update focused tests at the boundary being changed.
7. Treat production Worker, D1, hostname, secrets and Spotify OAuth as live event infrastructure. Never reset, recreate, repoint or migrate production resources as routine development work. Production changes require a reviewed migration/release plan and explicit approval.

## 2. Frontend asset separation

### HTML — document structure

- Use semantic elements, meaningful heading order, labels, accessible names and appropriate ARIA only where native semantics are insufficient.
- Keep markup declarative and readable.
- Load stylesheets through link elements and application entrypoints through external native ES modules.
- Do not embed application JavaScript, CSS, event handlers or style attributes in markup.
- Do not use inline style/script blocks or onclick-style attributes.
- Use stable IDs for page-level integration points and documented class/data attributes for component hooks.
- Do not move complex page markup into JavaScript template strings merely to make HTML files appear smaller. Dynamic DOM creation is permitted for genuinely data-driven content owned by a view/component module.

### CSS — presentation

- CSS files own all visual presentation. No inline styles or embedded page-level style blocks.
- Use design tokens for genuinely shared visual values.
- Keep selectors scoped to the owning page/component/feature.
- Avoid broad component selectors, excessive specificity, !important and incidental DOM-structure selectors.
- Keep responsive rules, states, transitions and keyframes beside the component/page styles they govern.
- Preserve existing visual values during extraction; structural refactoring is not a visual redesign.
- Do not split shared stylesheets until selector ownership is mapped and screenshot baselines are available.

### JavaScript — behaviour and DOM interaction

- Use native ES modules and explicit imports/exports.
- Page entrypoints are composition roots, not business-logic containers.
- View/component modules own DOM rendering, not persistence or domain decisions.
- Controllers coordinate interactions and delegate domain rules and data access.
- Pure model/mapper modules have no DOM, network, storage or provider side effects.
- API clients own HTTP transport and API contract handling.
- State has an explicit owner; avoid mirrored state and direct storage access outside the session/storage owner.
- Use safe DOM APIs and text insertion for untrusted/user-provided content.

### Narrow exception for runtime visual values

JavaScript may update a CSS class, data attribute, or narrowly scoped CSS custom property when a visual value is genuinely data-driven at runtime. Static styling remains in CSS.

## 3. File and module ownership

- Page entrypoint/composition root: page bootstrap and dependency wiring.
- View/component: DOM rendering and component-level UI interaction.
- Controller: event lifecycle and workflow coordination.
- Application use case: one user/business workflow and its orchestration.
- Domain/policy: deterministic business rules and validation; no framework/provider details.
- Repository: persistence queries and writes; no HTTP response serialization or DOM.
- Integration/provider adapter: external API protocol and response normalization.
- API client: frontend/backend transport contract; no visual rendering.
- State/session owner: lifecycle and persistence for its own state.
- Shared module: stable, genuinely reused primitives/contracts only.

Add abstractions only when they create a real ownership boundary, test seam, security boundary or required provider boundary.

## 4. Dependency direction

### Frontend

page composition → feature controllers → feature views/application services → API clients or pure models

Shared modules must not import feature modules. Features must not reach into another feature's private files.

### Worker

- Hono routes authenticate, validate/parse, call an application use case and serialize the result.
- Application use cases coordinate workflows and depend on contracts, not Hono or concrete infrastructure.
- Domain policies must not import Hono, Cloudflare, D1, DOM or provider implementations.
- Repositories own D1 access.
- Integration adapters own Spotify/provider protocols.
- The composition root wires Cloudflare bindings and concrete adapters.
- Queue and playback application services remain authoritative for state transitions and dispatch.

### AI-DJ authority boundary

The previous advice-only rule is intentionally superseded by the approved AI-DJ product direction documented in AI-DJ-ROADMAP.md.

- The current assistant remains text-only until the relevant implementation phase is delivered and reviewed.
- The target AI may receive a bounded, event-scoped projection of the PartyQueue state, aggregate audience preferences and recent feedback where required for a decision.
- The model may propose only schema-defined, allow-listed actions. The Worker validates intent, arguments, authorization, event scope, limits and current state before executing an existing application use case.
- The model never receives raw D1 handles, database credentials, Spotify access/refresh tokens or unrestricted network access.
- The model never writes directly to D1 and never bypasses repository/application workflows.
- Spotify catalogue results and track metadata may be returned to the model only if the action-planner phase explicitly requires them; expose only the minimum normalized fields needed. Never expose credentials or unrestricted Spotify APIs.
- PartyQueue is authoritative for its own queue/order. Spotify UP NEXT is separate. Playback control is a distinct permission/action from queue planning.
- Guest identity is temporary nickname/session only. Audience intelligence is event-level aggregate data, not durable personal profiling.
- All AI actions must be bounded, validated, auditable by outcome, idempotent where possible and covered by tests. The AI must report only actions confirmed by the application.
- Preserve the configured local Claude bridge / Cloudflare Workers AI providers and Neuron budget guard. No paid provider fallback without an explicit product decision.

## 5. Naming, size and complexity

- Use descriptive, consistent names that identify module responsibility.
- Prefer cohesive modules typically around 150–200 lines or fewer where practical. This is a review signal, not a hard limit.
- Review modules above that range for multiple responsibilities; split only along real behavioural boundaries.
- Avoid artificial micro-modules, generic dumping-ground folders and excessive indirection.
- Keep exported APIs small and use explicit dependency injection where it improves testability and ownership.

## 6. CSS migration and visual regression gate

Follow CSS-SELECTOR-INVENTORY.md:
1. Capture/review existing Playwright visual baselines.
2. Identify shared tokens, reset/base rules and controls from actual usage.
3. Extract one verified ownership group at a time without renaming selectors.
4. Compare guest desktop/mobile and DJ desktop/responsive screenshots.
5. Check relevant computed styles and responsive breakpoints.
6. Remove old rules only after equivalent presentation is verified.

The DJ console is PC-first with a 1024×768 responsive sanity check. Guest pages retain desktop and mobile baselines.

## 7. Change protocol

Before changing code:
1. Read the current implementation and owner documentation.
2. Identify the responsibility being changed and intended owner.
3. Trace callers, imports, side effects, storage and API contracts.
4. Record behaviour that must remain unchanged.
5. Define the smallest safe, coherent change.

For each change:
1. Keep the diff focused on one responsibility/boundary.
2. Add/update focused tests.
3. Run targeted tests, then the full available validation suite.
4. Review for accidental API, UI, security, data or behaviour changes.
5. Update responsibility maps and architecture docs in the same logical change.

If tests or browser validation cannot be run, state that explicitly. Never report authored tests as passed.

## 8. Security, compatibility and operational safeguards

- Never expose Spotify client secrets, refresh tokens, session secrets or other credentials to browser code.
- Preserve token encryption, signing, expiry, refresh leases and owner checks.
- Treat external/model-provided input as untrusted and validate/bound it at the owning boundary.
- Preserve the existing free-tier AI budget guard.
- Do not add paid services, runtime dependencies or frameworks without an explicit architectural decision.
- Test Worker/D1 resources may be changed only after confirming the target environment. Production resources and event data are live: no reset, destructive migration, hostname cutover, secret rotation or deployment without explicit approval.
- Never force-push, reset away work or resolve conflicts by blindly choosing one side.

## 9. Definition of done

A refactoring task is complete only when responsibility and dependency ownership are clear; behaviour is preserved or an approved change documented; relevant tests pass; typecheck, architecture checks and Worker dry-run pass where applicable; browser/screenshot validation passes for UI changes; documentation reflects actual code; and unavailable validation/risks are stated honestly.

Every production migration, deployment, hostname change and secret change requires explicit review and approval.

## 10. Related architecture documents

- REENGINEERING-PLAN.md — target architecture and migration sequence.
- AI-DJ-ROADMAP.md — approved audience-aware AI-DJ product direction and phases.
- API-INVENTORY.md — existing HTTP contracts and side effects.
- WORKER-RESPONSIBILITY-MAP.md — Worker module ownership.
- FRONTEND-RESPONSIBILITY-MAP.md — frontend module ownership.
- AI-RESPONSIBILITY-MAP.md — AI permissions and boundaries.
- CSS-SELECTOR-INVENTORY.md — selector ownership and safe CSS extraction.
