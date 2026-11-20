# Architecture

## Scope

Single-event deployment for New Year's Eve 2026 at `spotify.electrafest.be`. Multi-event administration remains out of scope.

## Runtime components (current implementation)

1. Guest web application: event-code entry, nickname, Spotify catalogue search and music requests.
2. DJ dashboard: protected login, overview, request moderation, queue ordering, playback controls and DJ#DATUUR AI assistant.
3. Cloudflare Worker + Hono: API routing, session security, DJ authentication, Spotify OAuth callback, server-side Spotify API integration, AI endpoints and scheduled cleanup.
4. Cloudflare D1: event, guest, request, settings and encrypted Spotify-auth records.
5. QueueRoom Durable Object: currently a minimal Durable Object endpoint; do not assume it already provides serialized queue dispatch or WebSocket live updates.

## Observed implementation status

The repository implementation is ahead of the original development checklist. The Worker currently exposes guest, request, DJ, AI and Spotify playback endpoints. The DJ HTML/JS contains a functional dashboard and AI controls.

The current Worker entrypoint (`apps/worker/src/index.ts`) still combines route registration, authentication/session helpers, D1 access, Spotify token encryption/refresh, playback/queue orchestration, AI endpoints, scheduled cleanup and the Durable Object class. The DJ script (`apps/web/dj.js`) combines API access, authentication, polling, state, queue operations, playback controls, AI actions and DOM rendering.

## Request lifecycle

`pending -> approved -> queued -> played`

Alternative paths:
- `pending -> rejected`
- `approved -> failed`
- `queued -> failed`

Preserve the exact current transition rules and API behaviour during extraction. Only the application queue/dispatch use case may perform privileged queue transitions and Spotify dispatch. Record success only after the external operation is confirmed.

## Hybrid moderation

Deterministic checks include guest session validity, request limits, duplicate-track handling, track eligibility and paused state. Eligible requests can be auto-approved while the DJ retains override controls.

AI provides recommendations and proposals only. The DJ must confirm actions that mutate the queue or control playback.

## Spotify boundary

Spotify is an external system. Keep OAuth, encrypted token storage, refresh, API calls, catalogue search and playback control behind a dedicated adapter and application services. Browser code must not call privileged Spotify endpoints directly.

Spotify's own queue is external state. PartyQueue manages its own request order and reconciles with Spotify playback; it must not promise full control over all Spotify queue state.

## Target architecture

The target is a **modular monolith** on Cloudflare Workers + Hono + D1. Do not introduce microservices or replace the technology stack without an ADR showing concrete benefit.

See [REENGINEERING-PLAN.md](architecture/REENGINEERING-PLAN.md) for the proposed module boundaries, dependency rules, AI architecture, staged migration and acceptance criteria.

## Security

- Spotify credentials and tokens remain server-side.
- DJ routes require a distinct authenticated session.
- Guest identity is server-generated and held in a signed/session cookie.
- Store only hashes of event access codes and DJ passwords.
- Rate-limit by guest session and IP where supported by the current design.
- Validate Spotify track identifiers server-side.
- Redact credentials, tokens, cookies and access codes from logs.
- Treat production D1 data and OAuth state as protected assets; use additive, tested migrations only.
