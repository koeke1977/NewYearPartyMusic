# PartyQueue AI-DJ roadmap

**Status (2026-11-22):** Event-scoped preferences, Audience Intelligence, crowd feedback, FLUSH, bounded live PartyQueue context, guarded DJ actions and opt-in add-only Autopilot are implemented on the current development line. DJ-visible run telemetry, budget-exhaustion reporting, diversity/repeated-artist guards and persisted STOP verification are implemented. Phase 9 end-to-end rehearsal and release verification remain; production release is not approved by this roadmap.
**Repository:** koeke1977/NewYearPartyMusic  
**Development workflow:** `main` only; do not create feature branches or routine pull requests.
**Scope:** Evolve the current assistant into an event-scoped, audience-aware AI-DJ with bounded PartyQueue execution while preserving the modular Cloudflare Worker architecture.

## Product goal

PartyQueue is the DJ booth and source of truth for the party queue, including requested, queued and played lifecycle state. In this event setup Spotify UP NEXT is populated from PartyQueue and is the downstream playback view of the same list, not an independent queue or signal. Spotify remains the catalogue and playback environment.

The AI-DJ should understand the music, understand the aggregate audience, make deliberate musical decisions, and execute approved DJ workflows through the existing application boundaries. It should not remain a chat-only suggestion generator.

A guest is represented by a temporary nickname/session, not a durable personal identity. PartyQueue must not build long-lived personal taste profiles.

## Non-negotiable invariants

1. PartyQueue owns the set. Its D1-backed queue and saved order are authoritative for DJ planning. In the current event setup Spotify UP NEXT is populated only from PartyQueue, so it is a downstream view of the same list, not an independent source; never double-count it.
2. No direct model-to-database access. The model may request a narrowly defined action, but the Worker validates it and invokes existing application use cases/repositories.
3. No unrestricted Spotify control. Catalogue search and queue changes must use existing Spotify adapters and authorized application workflows. Playback controls remain separate, guarded DJ actions.
4. Audience data is event-scoped and temporary. Nicknames and guest preferences are not used as durable identities or cross-event profiles.
5. Test data is not real audience preference. Test activity may be used to validate logic, but it must not silently become the live event's audience profile. FLUSH is the explicit event-data reset boundary.
6. Aggregate, don't profile. Store genre/subgenre counts and event-level feedback aggregates where possible. Do not retain a personal taste timeline per nickname.
7. Keep general DJ knowledge. FLUSH removes temporary event data, not the genre taxonomy, prompts, application rules or general DJ knowledge.
8. Feedback is a signal, not a command. Use minimum sample sizes, time windows, trend detection and bounded adjustments. One guest or one tap must not swing the whole set.
9. Explain actual results. The assistant must distinguish requested actions, completed actions, duplicates, rejected actions and partial failures. Never claim tracks were added unless the application confirms it.
10. Keep the free-first operating model. Reuse the configured local Claude bridge / Cloudflare Workers AI, keep the Neuron budget guard, and add no paid AI fallback or unnecessary service.

## Target architecture

Guest app: nickname/session, genre + subgenre preferences, decade / energy / mood preferences, music requests and live crowd feedback.
Cloudflare Worker workflows: event lifecycle, taxonomy validation, Audience Intelligence, feedback aggregation, PartyQueue read/write, Spotify catalogue search/validation and authenticated FLUSH.
AI-DJ orchestration: bounded event context, aggregate audience profile, recent PartyQueue context / played history, music taxonomy, DJ policy and allow-listed application actions.
Execution: PartyQueue D1 queue → existing dispatch → Spotify player. Spotify UP NEXT is the downstream playback view populated from this same PartyQueue.

The model does not receive database credentials, raw D1 handles, Spotify access tokens or an unrestricted tool surface. It receives only the minimum structured context needed for a decision. Any proposed action is schema-validated, authorized, bounded and executed by an application use case.

## Roadmap and acceptance criteria

### Phase 1 — Source audit and product/architecture baseline
- [x] Inspect current Worker, D1 schema, guest lifecycle, AI prompt/context, Spotify catalogue adapter, queue insertion and dispatch.
- [x] Confirm current DJ Spotify search/add endpoints already exist, but are separate from AI.
- [x] Reconcile the binding engineering standard and AI responsibility map with the implemented AI-DJ direction.
- [ ] Record current migration ledger and test/development/production resource boundaries before any data migration.
- Done when: current behaviour, side effects, authorization and migration/deployment safeguards are documented accurately.

### Phase 2 — Genre Taxonomy
- [x] Add a central, expandable DJ-oriented genre/subgenre vocabulary with stable IDs.
- [x] Include decade, mood, energy and danceability dimensions as shared vocabulary.
- [x] Add guest-facing multi-select controls and server-side validation against taxonomy IDs.
- [x] Add coverage tests and taxonomy documentation.
- Done when: guest preferences and AI context use stable IDs, not arbitrary free-text genre labels.

### Phase 3 — Event lifecycle and temporary guest preferences
- [x] Use the configured event ID to scope guest sessions, preferences, requests and aggregates.
- [x] Capture guest-selected genres, subgenres and optional decades/mood/energy.
- [x] Aggregate event-level counts; do not retain per-nickname taste history.
- [x] Define the operational reset boundary: run the authenticated FLUSH once before the real event; a separate test/live mode is intentionally not part of this single-event product.
- Done when: the live audience profile is rebuilt from the current event's active data after the pre-event reset.

### Phase 4 — Audience Intelligence
- [x] Calculate genre/subgenre popularity using unique active guest selections and bounded event aggregates.
- [x] Weight preferences as a directional signal, not a strict playlist quota.
- [x] Apply bounded genre weights so one popular genre cannot monopolize the set.
- [x] Combine initial preferences with requests and eligible event-level feedback.
- Done: the DJ console exposes aggregate audience signals and the AI receives a compact, bounded summary.

### Phase 5 — Live Crowd Feedback
- [x] Capture guest atmosphere and energy feedback.
- [x] Bound and deduplicate feedback so repeated taps cannot dominate.
- [x] Aggregate over rolling windows with minimum sample thresholds.
- [x] Expose eligible event-level trends to the DJ console and AI context.
- Done: feedback is treated as a directional signal only when sample thresholds are met.

### Phase 6 — FLUSH and event reset
- [ ] Define the exact event-scoped deletion manifest, including derived aggregates, conversations, preferences, guest sessions, requests and queue order.
- [ ] Keep taxonomy, DJ prompts/rules, Spotify OAuth connection and application settings.
- [ ] Implement DJ-authenticated, server-side password re-verification using the existing DJ Booth credential verification approach, explicit confirmation, CSRF/session protections and audit-safe result reporting.
- [ ] Execute deletion transactionally where D1 permits; handle related Durable Object state deliberately.
- [ ] Do not claim that FLUSH cleared an independent Spotify queue. In this event setup UP NEXT is populated from PartyQueue; any Spotify-side state outside that dispatch path must be treated as separate only when explicitly established.
- [ ] Require a reviewed migration and explicit release approval before any production FLUSH capability is enabled.
- Done when: a tested reset leaves the app configured and general DJ knowledge intact while all temporary event data is gone.

### Phase 7 — AI-DJ action planner and executor
- [x] Replace the current text-only mutation path with structured, schema-validated JSON decisions; ordinary advice remains text-only.
- [x] Give the model bounded read context: event profile, aggregate audience profile, PartyQueue IDs/order and recent played tracks.
- [x] Provide allow-listed application actions: Spotify catalogue search + exact-match add, remove an eligible queued item and reorder PartyQueue.
- [x] Execute actions through existing application use cases, never direct model-to-D1 writes.
- [x] Preserve DJ-session authorization, duplicate checks, queue invariants, Spotify rate limits and the existing dispatch workflow.
- [x] Bound add requests to 20 exact title/artist pairs and report actual added/already-present/failed counts.
- [x] Keep playback control separate from queue planning; this executor does not start, pause or skip playback.
- Done when: an explicit DJ command is converted to a validated plan, executed through application workflows and reported from actual results.

Implementation note: Spotify catalogue results stay inside the Worker. The model proposes exact title/artist pairs; the Worker searches Spotify, requires an exact normalized title-and-artist match, then calls the existing verified add workflow. Mutating turns bypass the answer cache.

### Phase 8 — Adaptive DJ direction and Autopilot
- [x] Add an explicit DJ-only Autopilot ON/OFF switch, OFF by default.
- [x] Run a scheduled check every five minutes only while enabled.
- [x] Refill only when five or fewer tracks are queued; target eight, with at most three additions per tick.
- [x] Reuse bounded audience/feedback/PartyQueue context, the free daily Neuron budget and existing Spotify exact-match insertion workflow.
- [x] Add a stale-safe D1 lease, retry cooldown and persisted hard-stop checks before Spotify search and before insertion.
- [x] Keep Autopilot add-only; it cannot remove/reorder tracks or control playback.
- [x] Add DJ-visible last-run/result telemetry and an explicit explanation when the AI budget is exhausted.
- [x] Add bounded genre/decade variety guidance and prevent repeated artists within one refill or against queued/recently played tracks; keep guest preferences directional rather than quotas.
- [x] Recheck the DJ hard stop after AI inference, after Spotify lookup and before each queue insertion; test STOP during inference and between Spotify search and insertion.
- Done when: the AI can maintain a healthy queue and adapt its next selections to meaningful audience changes without losing the overall party direction.

### Phase 9 — General rehearsal and release
- [ ] Run guest onboarding, preferences, requests, feedback, AI actions, queue dispatch and FLUSH end-to-end in a confirmed non-production environment.
- [ ] Test Spotify rate limits, missing devices, partial failures, duplicate tracks, concurrency, model timeout and free AI budget exhaustion.
- [ ] Verify no test data enters live context and no personal profile persists across events.
- [ ] Review exact D1 migrations and production release plan.
- [ ] Deploy only through guarded release workflow after explicit approval.

## Data handling model

| Data | Scope | FLUSH |
|---|---|---|
| Genre taxonomy and stable IDs | Application-wide | Keep |
| DJ prompts, rules and general music knowledge | Application-wide | Keep |
| Spotify OAuth connection and app settings | Application-wide | Keep |
| Guest nickname/session | Current event | Delete |
| Guest genre selections | Current event; aggregate for AI | Delete |
| Guest requests and votes | Current event | Delete |
| Crowd feedback and derived trends | Current event | Delete |
| PartyQueue queue, order and played history | Current event | Delete |
| Temporary AI conversation and decisions | Current event/session | Delete |
| Spotify UP NEXT | Downstream view populated from PartyQueue in this event setup | It reflects PartyQueue dispatch; do not count or describe it as an independent PartyQueue source |

## Current implementation facts

- D1 already has an events table and event-scoped guests and requests.
- Guest sessions are signed, event-bound and currently expire after 12 hours.
- Spotify catalogue search is already implemented through a client-credentials adapter.
- DJ track insertion already verifies a track against Spotify and inserts it into PartyQueue as queued.
- PartyQueue order is stored separately in the D1 settings table under partyqueue_order.
- Existing queue dispatch reads PartyQueue queued requests/order and starts the selected track through the Spotify playback workflow.
- The assistant uses bounded D1-backed PartyQueue and aggregate audience context. Spotify UP NEXT is not counted as an independent source, and Spotify catalogue content is not used for classification or training. DJ/AI conversation turns remain event/session scoped and expire after seven days.
- For ordinary advice, the model returns text. For explicit add/remove/reorder commands, it returns a bounded JSON action plan; the Worker validates intent and payloads before executing any action.
- Spotify catalogue search and exact title/artist matching run inside the Worker. Catalogue results and Spotify credentials are not sent to the model. Adding uses the existing Spotify-verified PartyQueue insertion workflow.
- Remove actions are restricted to IDs still present in the live queued set. Reorder actions must contain the complete current queue exactly once and are revalidated by the existing queue-management use case.
- Mutating assistant turns bypass answer caching. Actual application outcomes, including duplicates and failures, are reported and persisted as the assistant turn.
- Migration `0005_guest_music_preferences.sql` adds temporary event-scoped guest genre/subgenre, decade, mood and energy preferences. Audience Intelligence calculates aggregate counts and capped genre weights at request time; no derived personal profile is persisted.
- The DJ-only audience and crowd-feedback endpoints expose aggregate event signals. The guarded FLUSH workflow clears temporary event data while preserving application-wide configuration. A separate test/live event mode is intentionally not part of the agreed operating model; run one explicit FLUSH before the real event.

## Delivery protocol

- `main` is the only development branch. Do not create feature/fix/refactor branches or routine pull requests.
- Make small, focused commits directly on `main`; inspect each diff and verify the resulting head.
- Never make production D1 mutations, destructive resets, secret changes or deployments without explicit approval.
- Preserve the binding engineering standard: semantic HTML, CSS-only presentation, native ES modules, modular monolith, tests and focused diffs.
- Run targeted tests, full tests, typecheck, architecture checks and Worker dry-run where available. Report any validation not run.
- Phase 9 remains the outstanding real-event rehearsal and release-verification work; this roadmap does not approve a production deployment.
