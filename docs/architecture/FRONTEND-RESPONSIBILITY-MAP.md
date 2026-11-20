# Frontend responsibility map

Based on the current `apps/web/dj.js`, `apps/web/app.js`, HTML entrypoints and shared stylesheet. This is an extraction map, not a redesign of the UI.

## DJ console — current `apps/web/dj.js`

The DJ script is approximately 36 KB / 579 lines and currently owns several separate concerns:

| Current concern | Examples in current script | Target module |
|---|---|---|
| DOM bootstrap and element lookup | Global `querySelector` references, `el()` helper | `dj/bootstrap.ts`, `shared/dom/` |
| DJ session lifecycle | localStorage token, login state, `setLoggedIn`, `logout` | `dj/features/authentication/` |
| HTTP/API transport | `api(path, options)`, bearer header, JSON/error parsing | `shared/api/partyqueue-client.ts` |
| DJ application state | token, poll handle, settings, Spotify status flags, queue drag state, latest overview | `dj/state/` |
| Dashboard rendering | `render()`, stats, request cards, status labels | `dj/features/overview/` and `dj/features/requests/` views |
| Queue presentation | `orderedQueued()`, `renderDeck()`, `trackLine()`, drag/drop handlers | `dj/features/queue/` |
| Request moderation | `runAction()`, action buttons | `dj/features/requests/` |
| Settings controls | pause, auto-approve and auto-queue toggles | `dj/features/settings/` |
| Polling lifecycle | `refresh()`, `refreshSpotify()`, timers and in-flight guards | `dj/services/polling-service.ts` |
| Spotify playback controls | connect, play/pause/next/previous, volume, device and progress rendering | `dj/features/playback/` |
| AI request lifecycle | `askDJAI()`, prompt actions, response display and loading state | `dj/features/ai-assistant/` |
| AI queue proposal parsing | numbered-line parsing, title/artist matching, duplicate/omission checks and confirmation UI | `dj/features/ai-assistant/queue-proposal-parser.ts` |
| AI Spotify suggestions | search result groups, selected tracks, add-to-queue actions | `dj/features/ai-assistant/track-suggestions-view.ts` |
| ChatGPT hand-off | context formatting, queue snapshot, opening ChatGPT | `dj/features/ai-assistant/chatgpt-handoff.ts` |

## Guest application — current `apps/web/app.js`

The guest app currently combines:

- Guest form validation and join API request.
- Guest session persistence in localStorage.
- Authenticated Spotify search.
- Search debounce and AbortController lifecycle.
- Track result DOM construction.
- Request submission and button/feedback state.
- Logout and session restoration.

Target split:

- `guest/features/join/join-controller.ts`
- `guest/features/search/search-controller.ts`
- `guest/features/search/search-view.ts`
- `guest/features/requests/request-controller.ts`
- `shared/api/partyqueue-client.ts`
- `shared/session/guest-session-store.ts`

## HTML ownership

- `index.html` and `dj.html` should own semantic structure, labels, accessibility attributes and stable component hooks only.
- No inline JavaScript or embedded business rules.
- Convert scripts to ES module entrypoints only after module files and loading order are tested.
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
4. Extract guest join/search/request features.
5. Extract DJ authentication, overview and moderation features.
6. Extract queue and Spotify playback features.
7. Extract the AI assistant into independent prompt-action, proposal-validation, Spotify-suggestion and ChatGPT-handoff modules.
8. Inventory and split CSS by actual selector ownership.
9. Convert both HTML entrypoints to ES module scripts and remove the old monolithic scripts only after browser tests pass.

## Non-negotiable behaviour

- Preserve current visual identity and responsive behaviour.
- Preserve localStorage keys until an explicit migration handles existing sessions.
- Keep all Spotify and privileged API calls server-side; browser code calls only PartyQueue API routes.
- AI queue proposals must be validated against the latest DJ overview and require explicit confirmation.
- A stale poll response must never overwrite a newer playback state.
- Abort outstanding searches and stop polling on logout.
