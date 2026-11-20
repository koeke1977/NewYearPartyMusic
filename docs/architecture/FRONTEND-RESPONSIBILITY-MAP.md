# Frontend responsibility map

Based on the current `apps/web/dj.js`, `apps/web/app.js`, HTML entrypoints and shared stylesheet. This is an extraction map, not a redesign of the UI.

## DJ console — `apps/web/dj.js` ES module entrypoint

The DJ entrypoint has started its first low-risk extraction. It now imports:

- `modules/dj-api.js`: authenticated JSON API transport, with the current DJ token supplied at call time.
- `modules/dj-session.js`: reads, writes and clears the existing `partyqueue_dj_token` localStorage key.
- `modules/dom.js`: shared safe text-based DOM element factory, also used by the guest UI.
- `modules/dj-queue.js`: pure ordering of queued requests using saved order and the existing chronological fallback.
- `modules/dj-ai-queue-parser.js`: validates AI-proposed numbered lists against the live queued tracks and returns matched IDs plus unmatched lines; the existing unique-title fallback rule is preserved.
- `modules/dj-ai-suggestions.js`: extracts bounded, normalized numbered track suggestions and preserves the Spotify-query fallback when the AI response contains no parseable list.
- `modules/dj-polling.js`: owns the immediate refresh + five-second polling interval lifecycle and ensures a repeated start replaces the prior interval.
- `modules/dj-playback-display.js`: pure playback display helpers for elapsed time, clamped progress percentage and playing/paused/waiting labels; DOM rendering remains in the DJ entrypoint.
- `modules/dj-request-guard.js`: prevents overlapping status requests, invalidates in-flight responses when the DJ session ends, and prevents an old request's `finally` block from clearing a newer request's in-flight state.
- `modules/dj-playback-state.js`: pure Spotify UI-state mapping for volume normalization, play/pause/booth state, device/track summary and playback error priority.
- `dj.js` remains the page composition/controller for login, rendering, moderation, playback and AI interactions until those flows have dedicated tests.

`dj.html` now loads `dj.js` as a native ES module; no bundler or new runtime dependency was introduced.

The remaining DJ entrypoint still owns several separate concerns:

| Current concern | Examples in current script | Target module |
|---|---|---|
| DOM bootstrap and element lookup | Global `querySelector` references, `el()` helper | `dj/bootstrap.ts`, `shared/dom/` |
| DJ session lifecycle | localStorage token, login state, `setLoggedIn`, `logout` | `modules/dj-session.js` (token storage extracted), then `dj/features/authentication/` |
| HTTP/API transport | `api(path, options)`, bearer header, JSON/error parsing | `modules/dj-api.js` (extracted) |
| DJ application state | token, poll handle, settings, Spotify status flags, queue drag state, latest overview | `dj/state/` |
| Dashboard rendering | `render()`, stats, request cards, status labels | `dj/features/overview/` and `dj/features/requests/` views |
| Queue presentation | `orderedQueued()`, `renderDeck()`, `trackLine()`, drag/drop handlers | `modules/dj-queue.js` (ordering extracted), then `dj/features/queue/` |
| Request moderation | `runAction()`, action buttons | `dj/features/requests/` |
| Settings controls | pause, auto-approve and auto-queue toggles | `dj/features/settings/` |
| Polling lifecycle | `refresh()`, `refreshSpotify()`, timers and in-flight guards | `modules/dj-polling.js` (interval lifecycle) and `modules/dj-request-guard.js` (stale-response/in-flight guard) extracted; then `dj/services/polling-service.ts` |
| Spotify playback controls | connect, play/pause/next/previous, volume, device and progress rendering | `dj/features/playback/`; pure time/progress calculations in `modules/dj-playback-display.js` and connection/device/volume/transport display mapping in `modules/dj-playback-state.js` |
| AI request lifecycle | `askDJAI()`, prompt actions, response display and loading state | `dj/features/ai-assistant/` |
| AI queue proposal parsing | numbered-line parsing, title/artist matching, duplicate/omission checks and confirmation UI | `modules/dj-ai-queue-parser.js` (pure matching extracted), then `dj/features/ai-assistant/queue-proposal-parser.ts` |
| AI Spotify suggestions | numbered title/artist extraction, search result groups, selected tracks, add-to-queue actions | `modules/dj-ai-suggestions.js` (pure suggestion extraction), then `dj/features/ai-assistant/track-suggestions-view.ts` |
| ChatGPT hand-off | context formatting, queue snapshot, opening ChatGPT | `dj/features/ai-assistant/chatgpt-handoff.ts` |

## Guest application — current `apps/web/app.js`

The guest entrypoint has completed its first low-risk ES module extraction:

- `app.js` is now a small page bootstrap and join-form controller.
- `modules/guest-session.js` owns existing `partyqueue_session` restoration and persistence; the storage key and expiry rule are unchanged.
- `modules/guest-music-search.js` owns authenticated search, debounce/abort handling, result rendering, request submission and logout UI.
- `modules/dom.js` owns the shared safe text-based element factory.
- `index.html` loads `app.js` as a native ES module; no bundler or new dependency is required.

The next guest-side boundary should separate the search/request transport from rendering, but only after browser-level characterization tests are available.

## HTML ownership

- `index.html` and `dj.html` should own semantic structure, labels, accessibility attributes and stable component hooks only.
- No inline JavaScript or embedded business rules.
- `index.html` now loads the guest entrypoint as a native ES module. `dj.html` remains on its existing deferred classic script until the DJ extraction is ready.
- Preserve existing IDs and data attributes during migration to avoid breaking DOM contracts.

## CSS ownership

The current `styles.css` is approximately 58.8 KB and serves both guest and DJ surfaces. Do not split it by arbitrary file size. First inventory selectors and actual usage, then separate:

1. `styles/tokens.css`: color, spacing, typography, radii, shadows and motion tokens.
2. `styles/base.css`: reset, body, accessibility and shared layout primitives.
3. `shared/components/*.css`: buttons, cards, fields, badges and shared controls.
4. `guest/*.css`: guest-only layout and request search components.
5. `dj/*.css`: booth, queue, request moderation, AI panel and playback controls.

Avoid changing the visual design while splitting CSS. Compare screenshots at the existing desktop and mobile breakpoints after each change.

## Frontend migration sequence

1. Add browser-level characterization coverage for guest join/search/request and DJ login/dashboard/playback/AI flows.
2. Extract the API client and session storage without changing endpoint paths or localStorage keys.
3. Extract polling lifecycle and shared application state.
4. Finish guest search/request separation and add browser-level coverage.
5. Extract DJ authentication, overview and moderation features; the API client, token storage and pure queue-ordering helper are already separated.
6. Extract queue and Spotify playback features.
7. Extract the AI assistant into independent prompt-action, proposal-validation, Spotify-suggestion and ChatGPT-handoff modules.
8. Inventory and split CSS by actual selector ownership.
9. Complete DJ module migration, then keep both HTML entrypoints on native ES modules; remove old monolithic code only after browser tests pass.

## Non-negotiable behaviour

- Preserve current visual identity and responsive behaviour.
- Preserve localStorage keys until an explicit migration handles existing sessions.
- Keep all Spotify and privileged API calls server-side; browser code calls only PartyQueue API routes.
- AI queue proposals must be validated against the latest DJ overview and require explicit confirmation.
- A stale poll response must never overwrite a newer playback state.
- Abort outstanding searches and stop polling on logout.
