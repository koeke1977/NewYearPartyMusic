# PartyQueue AI-DJ roadmap

**Status:** Product direction approved; taxonomy, event-scoped guest preferences and the first Audience Intelligence slice are implemented on the feature branch. Remaining AI-context, feedback, reset and autonomous execution work is still pending.
**Repository:** koeke1977/NewYearPartyMusic
**Scope:** Evolve the current advice-only assistant into an event-scoped, audience-aware AI-DJ while preserving the modular Cloudflare Worker architecture.

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
- [ ] Reconcile the binding engineering standard and AI responsibility map with the approved AI-DJ direction.
- [ ] Record current migration ledger and test/development/production resource boundaries before any data migration.
- Done when: current behaviour, side effects, authorization and migration/deployment safeguards are documented accurately.

### Phase 2 — Genre Taxonomy
- [x] Add a central, expandable DJ-oriented genre/subgenre vocabulary with stable IDs.
- [x] Include decade, mood, energy and danceability dimensions as shared vocabulary.
- [ ] Add guest-facing multi-select controls and server-side validation against taxonomy IDs.
- [ ] Add coverage tests and taxonomy documentation.
- Done when: guest preferences and AI context use stable IDs, not arbitrary free-text genre labels.

### Phase 3 — Event lifecycle and temporary guest preferences
- [ ] Define explicit test/live event-session state and isolation.
- [ ] Capture guest-selected genres, subgenres and optional decades/mood/energy.
- [ ] Aggregate event-level counts; do not retain per-nickname taste history.
- [ ] Ensure test profiles cannot leak into live event context.
- Done when: live audience profile is rebuilt from current event participants only.

### Phase 4 — Audience Intelligence
- [ ] Calculate genre/subgenre popularity using unique active guest selections and configurable time windows.
- [ ] Weight preferences as a directional signal, not a strict playlist quota.
- [ ] Add diversity/fairness caps so one popular genre cannot monopolize the set.
- [ ] Combine initial preferences with request counts and event-level reactions.
- Done when: the DJ console can explain the current aggregate audience profile and the AI receives a compact, bounded summary.

### Phase 5 — Live Crowd Feedback
- [ ] Add simple guest feedback: atmosphere, energy and optional short text/request.
- [ ] Rate-limit and deduplicate feedback to avoid repeated taps dominating.
- [ ] Aggregate over rolling windows; use minimum sample thresholds.
- [ ] Detect sustained negative/positive trends and expose them to AI decision context.
- Done when: feedback changes the recommendation direction only when a meaningful audience trend exists.

### Phase 6 — FLUSH and event reset
- [ ] Define the exact event-scoped deletion manifest, including derived aggregates, conversations, preferences, guest sessions, requests and queue order.
- [ ] Keep taxonomy, DJ prompts/rules, Spotify OAuth connection and application settings.
- [ ] Implement DJ-authenticated, server-side password re-verification using the existing DJ Booth credential verification approach, explicit confirmation, CSRF/session protections and audit-safe result reporting.
- [ ] Execute deletion transactionally where D1 permits; handle related Durable Object state deliberately.
- [ ] Do not claim that FLUSH cleared an independent Spotify queue. In this event setup UP NEXT is populated from PartyQueue; any Spotify-side state outside that dispatch path must be treated as separate only when explicitly established.
- [ ] Require a reviewed migration and explicit release approval before any production FLUSH capability is enabled.
- Done when: a tested reset leaves the app configured and general DJ knowledge intact while all temporary event data is gone.

### Phase 7 — AI-DJ action planner and executor
- [ ] Replace the current text-only model flow with structured, schema-validated decisions.
- [ ] Give the model bounded read context: event profile, aggregate audience profile, PartyQueue queue/order and recent played tracks.
- [ ] Provide allow-listed application actions such as search catalogue, add validated track, remove eligible queue item and reorder PartyQueue.
- [ ] Execute actions through existing application use cases, never direct model-to-D1 writes.
- [ ] Preserve DJ authorization, duplicate checks, queue invariants, Spotify rate limits and the existing dispatch lock.
- [ ] Support exact-count commands such as "zet 20 schuurschijven" and report actual added/already-present/failed counts.
- [ ] Keep playback control separate from queue planning unless explicitly authorized as a distinct workflow.
- Done when: the AI can execute a bounded DJ request end-to-end and verifies the resulting PartyQueue state.

### Phase 8 — Adaptive DJ direction
- [ ] Combine audience profile, requests, feedback, current queue and recently played tracks.
- [ ] Use a bounded decision cadence rather than reacting to every individual tap.
- [ ] Support intentional genre/decade/energy pivots, diversity and surprise.
- [ ] Prevent repeated tracks and excessive dominance by one genre/artist.
- [ ] Show the DJ what changed and why; preserve DJ override.
- Done when: the AI can adapt its next selection to meaningful audience changes without losing the overall party direction.

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
- Current AI assistant is text-only and uses bounded D1-backed PartyQueue and aggregate audience context. It does not use Spotify UP NEXT as an independent source, and it must not use Spotify catalogue content for AI classification or training. It stores bounded DJ/AI conversation turns for seven days and a small set of explicit DJ preferences.
- Current AI track flow is browser-orchestrated: AI produces text suggestions, the browser separately searches Spotify, and the DJ explicitly selects tracks to add.
- Migration `0005_guest_music_preferences.sql` adds temporary event-scoped guest genre/subgenre, decade, mood and energy preferences. The Audience Intelligence workflow reads these records and calculates aggregate counts and capped genre weights at request time; no derived personal profile is persisted.\n- The DJ-only `GET /api/dj/audience` endpoint exposes the aggregate event profile. The DJ console refreshes and displays it alongside the queue overview.\n- Crowd feedback, test/live event separation, FLUSH and AI-context integration are not implemented yet.

## Delivery protocol

- One cohesive feature branch per logical change; PR to main; squash merge; auto-delete branch.
- Never make production D1 mutations, destructive resets, secret changes or deployments as part of development without explicit approval.
- Preserve the existing engineering standard: semantic HTML, CSS-only presentation, native ES modules, modular monolith, tests and focused diffs.
- Run targeted tests, full tests, typecheck, architecture checks and Worker dry-run where available. Report any validation not run.
