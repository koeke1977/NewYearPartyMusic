# Architecture overview

## Product and runtime scope

PartyQueue is a single-event DJ request and playback application for New Year's Eve 2026. The public application is served from `https://spotify.electrafest.be`. Multi-event administration is out of scope.

The application is a modular monolith on Cloudflare Workers, Hono and D1. It is not a microservice system.

## Runtime components

1. **Guest web app** — event-code join, nickname/session, music preferences, Spotify catalogue search, requests and crowd feedback.
2. **DJ console** — authenticated overview, moderation, queue management, Spotify playback controls, Audience Intelligence, AI assistant and Autopilot controls.
3. **Cloudflare Worker** — HTTP routes, authentication, application workflows, Spotify integrations, AI orchestration and scheduled jobs.
4. **Cloudflare D1** — event-scoped requests, queue state, preferences/aggregates, settings, AI conversation data and encrypted Spotify authorization state.
5. **QueueRoom Durable Object** — currently a minimal endpoint; do not assume it provides queue synchronization, WebSocket delivery or dispatch ownership.

## Source of truth and request lifecycle

PartyQueue D1 and its saved order are authoritative for requested, queued and played music. In the current event setup Spotify UP NEXT is populated from PartyQueue and is a downstream playback view of the same list, not an independent queue or signal.

The main request lifecycle is:

`pending → approved → queued → played`

Alternative terminal paths include rejected and failed states. Preserve the existing transition rules. Queue and playback application workflows own privileged state transitions and Spotify dispatch; a request is marked played only after successful provider confirmation.

## AI and Spotify boundaries

- Ordinary AI advice is text-only and does not mutate PartyQueue.
- Explicit DJ add/remove/reorder commands may request structured, bounded action plans. The Worker validates intent, authorization, arguments, event scope, current queue state and limits, then calls existing application workflows.
- The model receives only bounded event-scoped PartyQueue and aggregate audience/feedback context needed for the decision. It does not receive D1 handles, credentials, Spotify access tokens, raw catalogue search results or unrestricted provider access.
- For additions, the model proposes title/artist pairs; Spotify search and exact-match verification happen inside the Worker.
- Remove targets are resolved by the Worker against the live queue. Reorder must contain the complete current queued set exactly once.
- Autopilot is a separate opt-in scheduled workflow, OFF by default and add-only. It cannot remove/reorder tracks or control playback.
- Spotify OAuth, catalogue access and playback protocols remain behind server-side integration adapters.

## Engineering authority and detailed maps

The binding rules for HTML/CSS/JavaScript separation, module ownership, dependency direction, tests, branch discipline and production safeguards are in [ENGINEERING-STANDARD.md](architecture/ENGINEERING-STANDARD.md).

Use the focused documents for implementation detail:
- [Reengineering plan](architecture/REENGINEERING-PLAN.md) — current module boundaries and remaining architecture work.
- [API inventory](architecture/API-INVENTORY.md) — routes, access rules and side effects.
- [Worker responsibility map](architecture/WORKER-RESPONSIBILITY-MAP.md).
- [Frontend responsibility map](architecture/FRONTEND-RESPONSIBILITY-MAP.md).
- [AI responsibility map](architecture/AI-RESPONSIBILITY-MAP.md).
- [AI-DJ roadmap](architecture/AI-DJ-ROADMAP.md).
- [CSS selector inventory](architecture/CSS-SELECTOR-INVENTORY.md).

## Production safety

Production Worker, D1, Durable Objects, hostname, secrets, OAuth state and event data are live infrastructure. Never reset, recreate, repoint, migrate or deploy production as routine development work. Follow [the production runbook](runbooks/PRODUCTION-READINESS.md) and obtain explicit approval for every production release or destructive operation.
