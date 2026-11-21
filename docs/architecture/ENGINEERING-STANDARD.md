# NewYearPartyMusic Engineering Standard (NPES)

**Status:** Binding engineering standard for new and refactored code  
**Applies to:** `apps/web`, `apps/worker`, shared contracts, tests and tooling  
**Purpose:** Preserve existing behaviour while establishing explicit ownership, separation of concerns and maintainable module boundaries.

This standard complements `REENGINEERING-PLAN.md`, the responsibility maps and the API inventory. Where this document defines frontend presentation rules, it is authoritative. It does not authorize a framework migration, an untested behaviour change, destructive production-data operations or a production deployment.

## 1. Non-negotiable principles

1. Preserve existing user-visible behaviour, API routes, payloads, response shapes, authentication, storage formats and operational safeguards unless a separately reviewed change explicitly authorizes a change.
2. One file has one primary responsibility and one clear owner.
3. Keep dependencies explicit and directed. No circular imports, hidden globals or cross-feature imports of private implementation files.
4. Prefer cohesive modules over arbitrary file splitting. Do not split code merely to hit a line count.
5. Make the smallest safe change that advances the architecture.
6. Add or update focused tests at the boundary being changed.
7. Treat the production Worker, D1 database, hostname, secrets and Spotify OAuth connection as live event infrastructure and business-critical data. Never reset, recreate, repoint or migrate production resources as routine development work. Test resources may be disposable only after their bindings and data have been positively identified. Production changes require a reviewed migration/release plan and explicit approval.

## 2. Frontend asset separation

### HTML — document structure

HTML files own the page's semantic document structure and stable element hooks.

- Use semantic elements, meaningful heading order, labels, accessible names and appropriate ARIA only where native semantics are insufficient.
- Keep markup declarative and readable.
- Load stylesheets through `<link rel="stylesheet">`.
- Load application entrypoints through external native ES modules (`<script type="module" src="…">`).
- Do not embed application JavaScript, CSS, event handlers or style attributes in markup.
- Do not use inline `<style>`, inline `<script>`, `onclick`-style attributes or `style="…"`.
- Use stable IDs for page-level integration points and documented class/data attributes for component hooks. Avoid styling through JavaScript-specific selectors.
- Do not move complex page markup into JavaScript template strings merely to make HTML files appear smaller. Dynamic DOM creation is permitted when content is genuinely data-driven and is owned by a view/component module.

### CSS — presentation

CSS files own all visual presentation.

- No inline styles or embedded page-level style blocks.
- Use design tokens (CSS custom properties) for shared colours, typography, spacing, radii, borders, shadows and layering where those values are genuinely shared.
- Keep selectors scoped to the owning page/component/feature. Use explicit shared primitives only for genuinely shared UI.
- Avoid broad element selectors for component-specific styling, excessive specificity, `!important`, and styling based on incidental DOM structure.
- Keep responsive rules, states, transitions and keyframes beside the component/page styles they govern.
- Preserve existing visual values and behaviour during extraction. A structural CSS refactor is not a visual redesign.
- Do not rename classes or alter markup in the same change as a stylesheet move unless the change is required and independently validated.
- Do not split the existing shared stylesheet until selector ownership is mapped and the Playwright screenshot baseline is available for comparison.

### JavaScript — behaviour and DOM interaction

JavaScript owns behaviour, state transitions, event handling, rendering orchestration and communication.

- Use native ES modules and explicit imports/exports.
- No inline JavaScript, implicit globals or unrelated responsibilities bundled together.
- Page entrypoints are composition roots: locate page elements, construct feature modules, inject dependencies and connect page-level events. They must not become business-logic containers.
- View/component modules own DOM rendering and presentation interaction for their component. They must not own persistence, network policy or domain decisions.
- Controllers coordinate user interactions and application workflows. They should delegate data access and domain rules to their owners.
- Pure model/mapper modules transform data without DOM, network, storage or provider side effects.
- API clients own HTTP transport details and API contract handling. Feature modules call those clients rather than duplicating fetch logic.
- State has an explicit owner. Avoid mirrored state and direct storage access outside the session/storage owner.
- Use safe DOM APIs and text insertion for untrusted/user-provided content; do not introduce unsafe HTML injection.

### Narrow exception for runtime visual values

JavaScript may update a CSS class, data attribute, or a narrowly scoped CSS custom property when a visual value is genuinely data-driven at runtime (for example, a playback progress percentage). This must be documented at the owning component boundary. Static styling must remain in CSS; do not use runtime style mutation as a shortcut for ordinary styling.

## 3. File and module ownership

A module must have a clear responsibility, a small public interface and explicit dependencies.

- **Page entrypoint / composition root:** page bootstrap and dependency wiring only.
- **View / component:** DOM rendering and component-level UI interaction only.
- **Controller:** event lifecycle and coordination of feature workflows.
- **Application use case:** one user/business workflow and its orchestration.
- **Domain / policy:** deterministic business rules, validation and state-transition decisions; no framework/provider details.
- **Repository:** persistence queries and writes; no HTTP response serialization or DOM.
- **Integration / provider adapter:** external API protocol and response normalization; no application policy.
- **API client:** frontend/backend transport contract; no visual rendering.
- **State/session owner:** lifecycle and persistence for its own state; no unrelated feature state.
- **Shared module:** stable, genuinely reused primitives or contracts only. It must not become a miscellaneous dumping ground.

Do not introduce empty folders, speculative abstractions or interfaces solely for theoretical future providers. Add an abstraction when it creates a real ownership boundary, test seam, security boundary or required provider boundary.

## 4. Dependency direction

### Frontend

`page composition → feature controllers → feature views / application services → API clients or pure models`

Shared DOM helpers and stable contracts may be depended on by features. Shared modules must not import feature modules. Feature modules must not reach into another feature's private files; expose a deliberate public interface or move genuinely shared behaviour to an appropriate shared owner.

### Worker

Keep the modular-monolith boundaries in `REENGINEERING-PLAN.md`:

- Hono routes are transport adapters: authenticate/validate/parse, call an application use case and serialize the result.
- Application use cases coordinate workflows and depend on contracts, not Hono or concrete infrastructure.
- Domain policies contain business rules and must not import Hono, Cloudflare, D1, DOM or provider implementations.
- Repositories own D1 access.
- Integration adapters own Spotify/provider protocols.
- The composition root wires concrete dependencies.
- The current AI assistant is advice-only. The approved target AI-DJ authority boundary is defined below and in `AI-DJ-ROADMAP.md`; it does not take effect until each implementation phase is delivered, tested and reviewed.
- Queue and playback application services remain the authoritative path for state transitions and dispatch.



### AI-DJ authority boundary

The approved AI-DJ product direction evolves the current advice-only assistant in controlled phases. This section supersedes only the former blanket prohibition on AI access to bounded music context or application actions; it does not authorize an immediate implementation or bypass existing safeguards.

- The current assistant remains text-only until the relevant implementation phase is delivered and reviewed.
- The target AI may receive a bounded, event-scoped projection of PartyQueue state, aggregate audience preferences and recent feedback only where required for a decision.
- The model may propose only schema-defined, allow-listed actions. The Worker validates intent, arguments, authorization, event scope, limits and current state before executing an existing application use case.
- The model never receives raw D1 handles, database credentials, Spotify access/refresh tokens or unrestricted network access.
- The model never writes directly to D1 and never bypasses repository/application workflows.
- Spotify catalogue results and track metadata may be returned to the model only if the action-planner phase explicitly requires them; expose only the minimum normalized fields needed. Never expose credentials or unrestricted Spotify APIs.
- PartyQueue D1 is the source of truth for requested, planned (queued) and completed (played) tracks and its saved order. In the current event setup, Spotify UP NEXT is populated from PartyQueue and is only the downstream playback view of that same list; it is not an independent source or signal and must never be double-counted. Playback control/telemetry remains distinct from queue planning and may be claimed only when explicitly supplied.
- Guest identity is temporary nickname/session only. Audience intelligence is event-level aggregate data, not durable personal profiling.
- All AI actions must be bounded, validated, auditable by outcome, idempotent where possible and covered by tests. The AI must report only actions confirmed by the application.
- Preserve the configured local Claude bridge / Cloudflare Workers AI providers and Neuron budget guard. No paid provider fallback without an explicit product decision.

## 5. Naming, size and complexity

- Use descriptive, consistent names that identify the module's responsibility.
- Prefer cohesive modules typically around 150–200 lines or fewer where practical. This is a review signal, not a hard limit.
- A module above that range must be reviewed for multiple responsibilities; split only along real behavioural boundaries.
- A shorter file is not automatically better. Avoid artificial micro-modules and excessive indirection.
- Avoid generic names such as `helpers`, `misc` or `utils` for domain-specific behaviour.
- Keep exported APIs small. Prefer named exports and explicit dependency injection where it improves testability and ownership.

## 6. CSS migration and visual regression gate

The current shared stylesheet has an existing selector inventory in `CSS-SELECTOR-INVENTORY.md`. Follow its staged extraction sequence:

1. Capture/review the existing Playwright visual baselines.
2. Identify shared tokens, reset/base rules and controls from actual usage.
3. Extract one verified ownership group at a time without renaming selectors.
4. Compare guest desktop/mobile and DJ desktop/responsive screenshots.
5. Check relevant computed styles and responsive breakpoints.
6. Remove old rules only after equivalent presentation is verified.

The DJ console is PC-first: its primary baseline is desktop, with the documented 1024×768 responsive sanity check. Guest pages retain desktop and mobile baselines.

## 7. Change protocol

Before changing code:

1. Read the current implementation and its owner documentation.
2. Identify the responsibility currently being changed and its intended owner.
3. Trace callers, imports, side effects, storage and API contracts.
4. Record behaviour that must remain unchanged.
5. Define the smallest coherent extraction or correction.

For each change:

1. Keep the diff focused on one responsibility/boundary.
2. Add/update tests for the changed behaviour and contract.
3. Run the relevant targeted tests, then the full available validation suite.
4. Review the diff for accidental API, UI, security, data or behaviour changes.
5. Update responsibility maps and architecture docs in the same logical change.

If tests or browser validation cannot be run, state that explicitly. Never report authored tests as passed tests.

## 8. Security, compatibility and operational safeguards

- Never expose Spotify client secrets, refresh tokens, session secrets or other credentials to browser code.
- Preserve token encryption, signing, expiry, refresh leases and owner checks.
- Treat external/model-provided input as untrusted and validate/bound it at the owning boundary.
- Preserve the existing free-tier AI budget guard. Keep the assistant Spotify-independent; do not add a Spotify catalogue or queue tool to the model.
- Do not add paid services, runtime dependencies or frameworks without an explicit architectural decision.
- Test Worker/D1 resources may be changed or recreated only after confirming the target environment. Production Worker/D1 resources and event data are live: no reset, destructive migration, hostname cutover, secret rotation or deployment without explicit approval. Keep credentials secret and never commit them.
- Never force-push, reset away work or resolve merge conflicts by blindly choosing one side.

## 9. Definition of done

A refactoring task is complete only when:

- Responsibility and dependency ownership are clear.
- Existing functional and API behaviour is preserved or an approved behaviour change is documented.
- Relevant unit/contract tests pass.
- TypeScript/type checks and Worker dry-run pass where applicable.
- Browser/screenshot validation passes for UI/CSS changes.
- Documentation and responsibility maps reflect the actual code.
- Unavailable validation and remaining risks are stated honestly.
- Test resources may be changed or recreated. Every production migration, deployment, hostname change and secret change must be explicitly reviewed and approved.

## 10. Relationship to other architecture documents

This standard is used together with:

- `REENGINEERING-PLAN.md` — target architecture, backend boundaries and migration sequence.
- `API-INVENTORY.md` — existing HTTP contracts and side effects.
- `WORKER-RESPONSIBILITY-MAP.md` — Worker module ownership.
- `FRONTEND-RESPONSIBILITY-MAP.md` — frontend module ownership.
- `AI-RESPONSIBILITY-MAP.md` — AI permissions and boundaries.
- `CSS-SELECTOR-INVENTORY.md` — current selector ownership and safe CSS extraction.
