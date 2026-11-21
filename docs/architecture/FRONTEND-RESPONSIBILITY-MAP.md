# Frontend responsibility map

**Snapshot:** `refactor/architecture-mainline`, based on current `main`; reviewed 2026-11-21. This map describes the current native ES-module implementation.

## Page composition roots

- `apps/web/app.js`: guest page bootstrap and join-form lifecycle.
- `apps/web/dj.js`: DJ page composition root. It locates page-level elements, constructs feature modules, injects dependencies and connects page-level events. It is intentionally small; it is not the former monolithic DJ controller.
- `index.html` and `dj.html`: semantic structure, labels, accessibility attributes and stable DOM hooks. Both load external native ES modules and external stylesheets.

## Guest feature ownership

| Module | Responsibility |
|---|---|
| `modules/guest-session.js` | Guest token restoration, persistence and cleanup using the existing storage key/expiry behaviour |
| `modules/guest-music-api.js` | Authenticated guest search and request HTTP contracts |
| `modules/guest-music-search.js` | Search component lifecycle, debounce/abort, request workflow and guest UI interaction |
| `modules/guest-track-results-view.js` | Safe DOM rendering of Spotify result cards and request-button activation |
| `modules/dom.js` | Shared safe text-based DOM element factory |

## DJ feature ownership

| Module | Responsibility |
|---|---|
| `modules/dj-api.js` | Authenticated JSON API transport and normalized errors |
| `modules/dj-session.js` | DJ token storage primitives |
| `modules/dj-ai-session.js` | Stable browser UUID for the bounded DJ/AI conversation stored by the Worker |
| `modules/dj-auth-controller.js` | Login/logout and authenticated-console visibility lifecycle |
| `modules/dj-polling.js` | Overview and playback polling interval lifecycle |
| `modules/dj-request-guard.js` | In-flight request and stale-response protection |
| `modules/dj-latest-task-queue.js`, `dj-serial-task-queue.js` | Ordered async writes and invalidation of superseded/session-stale work |
| `modules/dj-playback-coordinator.js` | Playback status sequencing and Spotify command coordination |
| `modules/dj-playback-state.js`, `dj-playback-display.js` | Pure playback state projection and progress/time calculations |
| `modules/dj-spotify-console.js` | Spotify API lifecycle, volume-write sequencing and control event binding |
| `modules/dj-spotify-console-view.js` | DOM-only Spotify status, deck, volume, progress, transport and offline rendering |
| `modules/dj-command-service.js` | DJ moderation, queue reorder persistence, settings updates and NEXT command workflows |
| `modules/dj-queue.js`, `dj-queue-reorder.js` | Pure queue ordering and drag/drop interaction |
| `modules/dj-overview-model.js` | Pure projection of API overview data into UI state |
| `modules/dj-overview-view.js` | Dashboard stats, request cards, moderation action wiring and UP NEXT rendering |
| `modules/dj-ai-intent.js` | Prompt intent resolution and recovery of numbered suggestions |
| `modules/dj-ai-suggestions.js` | Bounded extraction of numbered track suggestions |
| `modules/dj-ai-actions.js` | Sequential DJ-selected track-add workflow, duplicate handling and partial failure reporting |
| `modules/dj-ai-assistant-view.js` | DOM-only AI answer and Spotify-suggestion rendering with explicit add-selection controls; invokes injected controller callbacks |
| `modules/dj-ai-assistant.js` | AI prompt lifecycle, mode orchestration, conversation-session ID and separate Spotify lookup/add workflows; no DOM construction |
| `modules/dj-chatgpt-handoff.js` | Spotify-independent second-opinion prompt containing event timing and optional DJ-authored preferences, clipboard transfer and regular ChatGPT tab handoff |
| `modules/dom.js` | Shared safe DOM element factory |

## Remaining frontend responsibility boundaries

The main page entrypoints are composition roots. Remaining mixed concerns are inside two feature controllers:

1. `dj-ai-assistant.js` now owns prompt submission, mode orchestration and API workflows. `dj-ai-assistant-view.js` owns suggestion/add-selection DOM rendering; `dj-ai-actions.js` owns sequential track additions and per-track failure handling. The assistant does not reorder the live queue. Track additions remain an explicit DJ selection from Spotify matches.
2. `dj-spotify-console.js` combines API/status coordination, volume-write lifecycle and event binding. Rendering is already isolated in `dj-spotify-console-view.js`, and playback sequencing is coordinated by `dj-playback-coordinator.js`. Further extraction should only occur if tests show a real responsibility seam; avoid another layer of pass-through wrappers.

The DJ AI conversation ID is browser-local; only DJ prompts and AI-generated answers are stored server-side for the same event/session, with a maximum of eight turns and seven-day retention. Spotify search results are never stored as AI context.

The guest and DJ feature modules should not import each other's private implementation files. Shared DOM behaviour belongs in `modules/dom.js` only while it remains genuinely shared.

## CSS ownership

- `styles/tokens.css`: six shared root design tokens.
- `styles/base.css`: font import and universal/html/body foundation rules.
- `styles.css`: shared page shell and shared text-button foundations.
- `styles/guest.css`: guest search/results/request presentation.
- `styles/dj-layout.css`: DJ console shell, stage, deck and cockpit layout.
- `styles/dj-playback.css`: Spotify transport, turntables, mixer, volume and playback-state presentation.
- `styles/dj-request-search.css`: DJ-side guest search and request discovery.
- `styles/dj-queue.css`: queue tiles, reordering and queue presentation.
- `styles/dj-ai.css`: DJ AI assistant presentation.

The DJ stylesheet order in `dj.html` preserves the original cascade. Guest pages do not load DJ-only stylesheets. Selector ownership and extraction history are recorded in `CSS-SELECTOR-INVENTORY.md`. That inventory's early counts are historical snapshots; do not treat them as current counts without re-running the inventory against the current branch.

## Browser contracts and validation

The Playwright browser journeys use deterministic API stubs and cover guest join/search/request, DJ login/session, overview/playback polling and logout. They do not call Spotify or the deployed Cloudflare test resources. The screenshot workflow captures guest desktop/mobile and DJ desktop/responsive baselines.

Run:
- `npm run test:browser`
- `npm run screenshots:baseline`

A green browser journey does not replace Worker/API contract tests or a future real-event smoke test.

## Behaviour invariants

- Preserve existing DOM IDs, localStorage keys, endpoint paths and payloads.
- Browser code calls PartyQueue API routes; Spotify secrets/tokens remain server-side.
- The AI receives a bounded PartyQueue snapshot and may request add/remove/reorder actions only through a structured plan. The Worker validates the DJ's explicit intent and current queue state, verifies Spotify matches server-side and returns confirmed outcomes; the browser never writes the queue directly. Ordinary AI suggestions remain unverified until the DJ explicitly asks to add them.
- Track additions are sequential, duplicate-aware and report partial failures.
- Stale polling responses must never overwrite newer state.
- Outstanding searches are aborted and polling/task queues are invalidated when the DJ session ends.
- Preserve the current visual identity and responsive behaviour; no framework migration is required.
