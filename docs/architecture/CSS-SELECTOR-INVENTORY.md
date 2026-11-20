# CSS selector ownership inventory

Snapshot: `apps/web/styles.css` on `refactor/architecture-foundation`.

## Measured structure

- 58,814 characters across 655 lines.
- 574 selector blocks.
- 32 media-query blocks, covering 13 distinct breakpoint expressions.
- Four keyframe animations: `vinyl-spin`, `booth-spin`, `booth-meter` and `spotify-fallback-pulse`.
- Six top-level design tokens in `:root`: `--bg`, `--panel`, `--border`, `--text`, `--muted` and `--green`.
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
2. Extract the six root design tokens and reset/base rules without changing values.
3. Identify shared controls and layout primitives from actual usage in both HTML entrypoints.
4. Move guest-only selectors by verified markup ownership; do not rename classes in the same change.
5. Move DJ-only selectors, keeping booth animations and responsive rules with their owning component.
6. Compare screenshots after each move and check computed styles at every existing breakpoint.
7. Remove the original rules only after visual and browser-level checks pass.

## Current decision

No CSS has been moved or rewritten in this pass. The selector inventory is groundwork only. The Playwright capture workflow now produces the desktop/mobile baseline as a CI artifact; review those captures before changing the shared stylesheet. Avoiding an unverified split is safer than creating superficially tidy files that alter the live design.
