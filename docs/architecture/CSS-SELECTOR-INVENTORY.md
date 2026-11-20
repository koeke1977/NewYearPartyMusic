# CSS selector ownership inventory

**Snapshot:** `refactor/architecture-foundation`, reviewed 2026-11-20. This inventory describes the current stylesheet split and measured selector structure.

## Current measured structure

The nine stylesheets under `apps/web` contain **58,952 characters** and **576 selector blocks** in total:

| Stylesheet | Characters | Selector blocks | Media queries |
|---|---:|---:|---:|
| `styles.css` | 3,588 | 40 | 1 |
| `styles/base.css` | 434 | 3 | 0 |
| `styles/tokens.css` | 174 | 1 | 0 |
| `styles/guest.css` | 1,480 | 18 | 1 |
| `styles/dj-layout.css` | 13,669 | 169 | 8 |
| `styles/dj-playback.css` | 30,448 | 251 | 16 |
| `styles/dj-request-search.css` | 3,731 | 40 | 2 |
| `styles/dj-queue.css` | 1,382 | 13 | 1 |
| `styles/dj-ai.css` | 4,046 | 41 | 3 |
| **Total** | **58,952** | **576** | **32** |

There are 13 distinct media-query expressions and four keyframe animations: `vinyl-spin`, `booth-spin`, `booth-meter` and `spotify-fallback-pulse`. The stylesheets contain 106 `!important` declarations; most are in `dj-playback.css` (85) and `dj-request-search.css` (15). Treat these as existing cascade constraints, not as permission for more overrides.

The six shared design tokens in `styles/tokens.css` are `--bg`, `--panel`, `--border`, `--text`, `--muted` and `--green`. `styles/base.css` owns the Inter font import and shared reset/html/body foundation.

## Stylesheet ownership

| Stylesheet | Owner |
|---|---|
| `styles/tokens.css` | Shared design tokens |
| `styles/base.css` | Shared font and document foundation |
| `styles.css` | Shared page shell, typography and genuinely shared controls |
| `styles/guest.css` | Guest search, results and request presentation |
| `styles/dj-layout.css` | DJ console shell, stage, deck and cockpit layout |
| `styles/dj-playback.css` | Spotify transport, turntables, mixer, volume and playback state |
| `styles/dj-request-search.css` | DJ-side request discovery and search |
| `styles/dj-queue.css` | Queue tiles, reordering and queue presentation |
| `styles/dj-ai.css` | DJ AI assistant and ChatGPT handoff presentation |

`index.html` loads tokens, base, shared styles and guest styles. `dj.html` loads tokens, base, shared styles and the five DJ stylesheets in the established cascade order. Guest pages do not load DJ-only stylesheets.

## Shared-selector risks

The shared stylesheet still contains broad selectors such as `body`, `form`, `label`, `input`, `footer`, `.shell`, `.join-card`, `.button`, `.fine-print` and `.form-message`. Both pages use the shared file, so moving these selectors requires checking their actual use on both pages.

Guest search classes are not consistently namespaced under `.guest-*`. The DJ surface uses `.dj-*`, `.booth-*`, `.queue-*` and shared utility selectors. Do not mechanically rename these selectors as part of a stylesheet move.

## Validation and safe-change rules

- The Playwright browser journeys cover guest join/search/request and DJ login/dashboard/polling/logout using deterministic API stubs.
- The screenshot workflow captures guest desktop (1440×1000), guest mobile (390×844), DJ desktop (1600×1100) and DJ responsive (1024×768). It uses mock data and a test-only DJ token; it does not contact Spotify or production Cloudflare services.
- Run `npm run test:browser` and `npm run screenshots:baseline` after CSS changes.
- Keep responsive rules, states, transitions and keyframes with their owning component.
- Preserve stylesheet link order unless visual comparison proves a change safe.
- Avoid adding more `!important` declarations. Remove existing ones only when a focused visual comparison proves the cascade remains unchanged.
- Keep HTML free of inline styles, inline event handlers and embedded style/script blocks. Application scripts remain external native ES modules.

## Extraction status

Completed:
1. Six root design tokens and shared document foundation moved to `styles/tokens.css` and `styles/base.css`.
2. Guest-only search/results/request rules moved to `styles/guest.css`, loaded only by `index.html`.
3. DJ-only layout, playback, request-search, queue and AI rules moved to their own stylesheets.
4. Both page entrypoints load the shared foundation followed by their own feature stylesheets. The existing cascade order is preserved.

The earlier counts of 568 blocks in `styles.css` and the old `.dj-*`/`.booth-*` cluster counts were snapshots from before the DJ stylesheet extraction; they are not current measurements.
