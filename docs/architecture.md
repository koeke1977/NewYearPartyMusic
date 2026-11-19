# Architecture

## Scope

Single-event deployment for New Year's Eve 2026 at `spotify.electrafest.be`. Multi-event administration is explicitly out of scope.

## Components

1. Guest web app: event code, nickname, Spotify search, request submission and queue status.
2. DJ dashboard: protected host interface, playback state, moderation, queue controls and pause switch.
3. Cloudflare Worker: API, validation, DJ authentication, Spotify OAuth callback and server-side Spotify calls.
4. D1: guests, requests and configuration.
5. QueueRoom Durable Object: serialized dispatch and live WebSocket updates.

## Request lifecycle

`pending -> approved -> queued -> played`

Alternative paths:
- `pending -> rejected`
- `approved -> failed`
- `queued -> failed` (API/playback/reconciliation failure)

Only the serialized dispatcher may send approved requests to Spotify. It records success only after Spotify confirms the operation.

## Hybrid moderation

Automatic checks: valid event session, nickname, request limits, duplicate track, track eligibility and paused state. Eligible requests may be auto-approved; the DJ can override, pause intake or reject requests.

Spotify's queue is external state. PartyQueue manages its own request order but must reconcile with Spotify playback state; it must not promise full control over Spotify's entire queue.

## Security

- Spotify OAuth tokens and client secret are server-side only.
- DJ routes require a distinct authenticated session.
- Guest identity is server-generated and held in a signed/session cookie.
- Store only hashes of event access code and DJ password.
- Rate-limit by guest session and IP.
- Validate Spotify track IDs server-side.
