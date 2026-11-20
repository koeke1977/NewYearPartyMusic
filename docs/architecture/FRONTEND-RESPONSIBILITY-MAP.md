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
- `modules/dj-latest-task-queue.js`: serializes asynchronous DJ control writes, skips queued values superseded by newer input, and invalidates pending work when the DJ session ends.
- `modules/dj-serial-task-queue.js`: low-level serial task primitive that preserves command order and invalidates queued work after a session change.
- `modules/dj-playback-coordinator.js`: coordinates Spotify status reads and transport commands, rejects stale status responses, prevents polling during commands, reports command errors and refreshes status after the final queued command. It deliberately does not retry `next`/`previous` commands.
- `modules/dj-chatgpt-handoff.js`: builds the current Spotify/UP NEXT context prompt and owns opening the user\u2019s regular ChatGPT tab plus clipboard transfer.
- `modules/dj-playback-state.js`: pure Spotify UI-state mapping for volume normalization, play/pause/booth state, device/track summary and playback error priority.
- `modules/dj-ai-intent.js`: resolves free-text DJ prompts into the existing advice, import, fill or optimize modes and recovers numbered suggestions from the previous AI answer with real line breaks.
- `modules/dj-overview-model.js`: pure projection of the DJ overview response into lifecycle counts, requested/remaining durations, saved queue order, next track, live requests and queue positions.
- `modules/dj-queue-reorder.js`: owns drag-and-drop interaction and calculates the new queue order; the page controller supplies the save callback.
- `modules/dj-command-service.js`: owns the authenticated DJ mutation workflows for moderation, queue reordering, party settings and dispatching the next PartyQueue request, including success/error messaging and overview/playback refresh. The page controller supplies the API, refresh and message dependencies.
- `modules/dj-spotify-console.js`: owns Spotify status refresh, connection/device/track/volume/progress presentation, fallback queue preview, volume-write lifecycle and Spotify control bindings. It receives the API, playback coordinator accessor, message callback and queue-preview callback explicitly.
- `modules/dj-ai-assistant.js`: owns DJ AI prompt submission, advice/import/fill/starter/optimize flows, AI response rendering, safe queue reorder confirmation and Spotify suggestion selection/addition. It receives the API, overview refresh and document dependencies explicitly.
- `modules/dj-auth-controller.js`: owns DJ login submission, persisted-token lifecycle, login/logout and authenticated-console visibility. Polling and playback invalidation are injected through one state-change callback.
- `modules/dj-overview-view.js`: owns dashboard stats, request cards, moderation action wiring and UP NEXT rendering. It consumes the pure overview model and receives queue, command and Spotify view dependencies explicitly; it also preserves request cards while a drag reorder is active.
- `modules/guest-music-api.js`: owns the guest Spotify search and track-request HTTP contracts, including authorization headers, URL encoding, request payloads and server-error handling.
- `dj.js` remains the page composition/controller for page-level event composition. Login/session lifecycle, dashboard/request rendering, Spotify presentation/control bindings, AI assistant interactions, command workflows, pure overview projection, prompt intent, playback coordination, queue ordering and drag-and-drop interaction are separated.

`index.html` and `dj.html` load their entrypoints as native ES modules; no bundler or new runtime dependency was introduced.

The remaining DJ entrypoint still owns several separate concerns:

| Current concern | Examples in current script | Target module |
|---|---|---|
| DOM bootstrap and element lookup | Global `querySelector` references, `el()` helper | `dj/bootstrap.ts`, `shared/dom/` |
| DJ session lifecycle | login submission, persisted token, login/logout and console visibility | `modules/dj-session.js` (storage primitives) and `modules/dj-auth-controller.js` (authentication lifecycle extracted) |
| HTTP/API transport | `api(path, options)`, bearer header, JSON/error parsing | `modules/dj-api.js` (extracted) |
| DJ application state | token, poll handle, settings and latest overview | `dj/state/`; queue drag state is encapsulated by `modules/dj-queue-reorder.js` |
| Dashboard rendering | stats, request cards, status labels and UP NEXT view | `modules/dj-overview-model.js` (pure response projection) and `modules/dj-overview-view.js` (DOM rendering and moderation action wiring extracted) |
| Queue presentation | `orderedQueued()`, `renderDeck()`, `trackLine()` | `modules/dj-queue.js` (ordering extracted), `modules/dj-queue-reorder.js` (drag/drop interaction extracted), `modules/dj-command-service.js` (save workflow extracted), then `dj/features/queue/` |
| Request moderation and DJ commands | moderation, settings, queue reorder persistence and NEXT dispatch | `modules/dj-command-service.js` (mutation lifecycle extracted), then `dj/features/requests/` and `dj/features/queue/` |
| Settings controls | pause, auto-approve and auto-queue toggles | `modules/dj-command-service.js` (mutation lifecycle extracted), then `dj/features/settings/` |
| Polling lifecycle | overview refresh, Spotify status refresh, timers and in-flight guards | `modules/dj-polling.js` (interval lifecycle) and `modules/dj-request-guard.js` (stale-response/in-flight guard) extracted; then `dj/services/polling-service.ts` |
| Spotify playback controls | connect, play/pause/next/previous, volume, device and progress rendering | `modules/dj-spotify-console.js` (status, display, volume and control bindings extracted), `modules/dj-playback-coordinator.js` (command/status coordination), `modules/dj-playback-display.js` (pure time/progress calculations), `modules/dj-playback-state.js` (pure connection/device/volume/transport mapping) |
| AI request lifecycle | prompt submission, loading/error state, answer display, suggestion selection and queue proposal confirmation | `modules/dj-ai-assistant.js` (AI interaction flow extracted), `modules/dj-ai-intent.js` (prompt intent), `modules/dj-ai-queue-parser.js` (proposal validation), `modules/dj-ai-suggestions.js` (track extraction) |
| AI queue proposal parsing | numbered-line parsing, title/artist matching, duplicate/omission checks and confirmation UI | `modules/dj-ai-queue-parser.js` (pure matching extracted), then `dj/features/ai-assistant/queue-proposal-parser.ts` |
| AI Spotify suggestions | numbered title/artist extraction, search result groups, selected tracks, add-to-queue actions | `modules/dj-ai-suggestions.js` (pure suggestion extraction), then `dj/features/ai-assistant/track-suggestions-view.ts` |
| ChatGPT hand-off | live context prompt, opening ChatGPT and clipboard transfer | `modules/dj-chatgpt-handoff.js` (prompt builder and browser hand-off controller extracted) |

## Guest application — current `apps/web/app.js`

The guest entrypoint has completed its first low-risk ES module extraction:

- `app.js` is now a small page bootstrap and join-form controller.
- `modules/guest-session.js` owns existing `partyqueue_session` restoration, persistence and cleanup; the storage key and expiry rule are unchanged.
- `modules/guest-music-api.js` owns authenticated Spotify search and track-request transport; endpoint paths, headers and payloads are unchanged.
- `modules/guest-music-search.js` owns the guest search component, debounce/abort lifecycle, search/request workflow and logout UI; it delegates transport, result rendering and session cleanup.
- `modules/guest-track-results-view.js` owns Spotify result-card DOM rendering and delegates request-button activation back to the search controller.
- `modules/dom.js` owns the shared safe text-based element factory.
- `index.html` loads `app.js` as a native ES module; no bundler or new dependency is required.

The guest search transport and Spotify result-card rendering are now separate from the search controller. Focused unit coverage protects the result-card contract; browser-level characterization remains the gate before changing the wider UI lifecycle or shared CSS.

## HTML ownership

- `index.html` and `dj.html` should own semantic structure, labels, accessibility attributes and stable component hooks only.
- No inline JavaScript or embedded business rules.
- Both `index.html` and `dj.html` load their entrypoints as native ES modules. The DJ page was converted as part of the DJ console module foundation.
- Preserve existing IDs and data attributes during migration to avoid breaking DOM contracts.

## CSS ownership

The stylesheet foundation is now layered: `styles/tokens.css` owns the six root design tokens, `styles/base.css` owns the font import and universal/html/body reset, and `styles.css` retains the shared components plus guest and DJ surfaces. Both HTML entrypoints load these in that order. The first extraction moved rules without changing values or visual design. The remaining `styles.css` still serves both guest and DJ surfaces. The measured selector clusters and shared-selector risks are recorded in `docs/architecture/CSS-SELECTOR-INVENTORY.md` (574 selector blocks, 32 media-query blocks). Do not split it by arbitrary file size. Capture desktop/mobile browser screenshots first, then separate:

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
