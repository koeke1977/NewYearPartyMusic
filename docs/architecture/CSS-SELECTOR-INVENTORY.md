# CSS selector ownership inventory

Snapshot: `apps/web/styles.css`, `apps/web/styles/tokens.css` and `apps/web/styles/base.css` on `refactor/architecture-foundation`.

## Measured structure

- `58,285` characters across 4 lines in `styles.css` after the first extraction.
- 568 selector blocks remain in `styles.css`; four foundation blocks were moved unchanged in value to the two shared foundation files (one token block and three reset/base blocks).
- 32 media-query blocks, covering 13 distinct breakpoint expressions.
- Four keyframe animations: `vinyl-spin`, `booth-spin`, `booth-meter` and `spotify-fallback-pulse`.
- Six top-level design tokens in `styles/tokens.css`: `--bg`, `--panel`, `--border`, `--text`, `--muted` and `--green`.
- Shared reset/base rules and the Inter font import now live in `styles/base.css`; the original declarations and values were moved without redesign.
- The stylesheet imports Inter and contains both guest and DJ surfaces.

## Naming clusters (selector-block counts)

| Cluster | Blocks | Initial ownership signal |
|---|---:|---|
| `.dj-*` | 179 | DJ console, request moderation and AI panel |
| `.booth-*` | 182 | Hardware-style Spotify booth |
| `.track-*` | 33 | Guest search results and track display |
| `.queue-*` | 29 | Queue and UP NEXT presentation |
| `.button*` | 6 | Shared form/button primitives |

These are naming signals, not a safe mechanical split. A selector block may contain multiple selectors, and some generic selectors are used by both pages.

## Shared-selector risks

The stylesheet includes global selectors such as `body`, `form`, `label`, `input`, `footer`, `.shell`, `.join-card`, `.button`, `.fine-print` and `.form-message`. Both `index.html` and `dj.html` load the same stylesheet. Moving these rules into a guest-only or DJ-only file without checking actual usage could silently change layout, typography, controls or responsive behaviour.

The guest search uses several generic classes rather than a consistent `.guest-*` namespace. The DJ interface combines `.dj-*`, `.booth-*`, `.queue-*` and shared utility selectors. The AI panel also has its own selector family.

## Safe extraction sequence

1. Capture the guest page on desktop and mobile. Capture the DJ console primarily on a desktop viewport (1600×1100), with a single 1024×768 responsive sanity check; it is a PC-first control surface. The repeatable Playwright capture is in `scripts/capture-ui-baseline.mjs`; CI uploads `guest-desktop.png`, `guest-mobile.png`, `dj-desktop.png` and `dj-responsive-check.png` as the `partyqueue-ui-baseline` artifact. DJ captures use deterministic mock API data and a seeded test-only DJ token, never Spotify or production data.
2. **Completed:** extract the six root design tokens to `styles/tokens.css` and the reset/base rules to `styles/base.css`, without changing their values.
3. Shared `.text-button` and `.button:disabled` rules remain in `styles.css` because both pages use them.
4. **Completed:** move the guest-only search/results/request selectors and their mobile overrides to `styles/guest.css`, loaded only by `index.html`; class names and values are unchanged.
5. Move DJ-only selectors, keeping booth animations and responsive rules with their owning component.
6. Compare screenshots after each move and check computed styles at every existing breakpoint.
7. Remove the original rules only after visual and browser-level checks pass.

## Current decision

The first CSS foundation extraction is complete. Both HTML entrypoints now load `styles/tokens.css`, `styles/base.css` and the remaining `styles.css` in that order. Only the six root tokens, universal box-sizing reset, `html`, and `body` foundation rules plus the font import moved; all values and component selectors are preserved. The before/after Playwright captures are pixel-identical at all four viewports: guest desktop (1440×1000), guest mobile (390×844), DJ desktop (1600×1813 full-page capture) and DJ responsive (1024×1865 full-page capture). The guest-specific selector move is also pixel-identical at all four viewports. Shared `.text-button` and `.button:disabled` remain in `styles.css`; the DJ page does not load `styles/guest.css`. Continue with DJ-only selectors only after their ownership is verified from `dj.html` and the relevant DOM hooks.


## DJ stylesheet extraction

- `apps/web/styles.css`: shared page shell and text-button foundations used by both guest and DJ pages.
- `apps/web/styles/dj-console.css`: DJ-only console, stage, mixer, Spotify transport, turntable, request queue, reorder and AI assistant presentation.
- `apps/web/dj.html` loads `styles.css` followed by `styles/dj-console.css` to preserve the original cascade order. Guest page keeps its existing `styles.css` then `styles/guest.css` order.

This extraction moves the existing declarations without rewriting selectors or values; visual baselines are required to validate that the page output remains unchanged.
