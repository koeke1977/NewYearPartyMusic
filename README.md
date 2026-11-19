# PartyQueue — New Year's Eve 2026

Private, QR-based music request queue for a single New Year's Eve event.

## Decisions

- Single event: `NYE2026`
- Production hostname: `spotify.electrafest.be`
- Guests join by event code and self-chosen nickname; no Spotify login
- One host-owned Spotify Premium account controls playback
- Hybrid moderation: automatic checks plus DJ override
- Visual direction: dark club / neon green
- Initial limits: 2 open requests per guest; 5 requests per 30 minutes

## Stack

- Cloudflare Workers + Hono
- Cloudflare D1
- Durable Objects for serialized queue dispatch and live state
- Spotify Web API (official Spotify client remains the audio player)

## Layout

```
apps/worker/src/     Worker API and Spotify integration
apps/web/            Guest and DJ web interface
db/schema.sql        Initial single-event schema
docs/                Architecture and setup notes
```

## Local development

Requirements: Node.js LTS and npm.

```bash
npm install
npm run dev
```

## Cloudflare Builds

The repository is configured for Cloudflare Workers Builds:

- Build command: `npm install`
- Deploy command: `npm run deploy`
- Preview command: leave empty
- Root directory: repository root

The Worker is configured in `wrangler.toml`. Keep Cloudflare bindings and the Wrangler configuration aligned.

## Cloudflare setup

1. Create a Worker named `partyqueue`.
2. Create a D1 database named `partyqueue-db`.
3. Set the D1 database ID in `wrangler.toml`.
4. Add the custom domain `spotify.electrafest.be` to the Worker.
5. Configure Worker secrets:
   - `SPOTIFY_CLIENT_ID` — Client ID from the Spotify Developer Dashboard
   - `SPOTIFY_CLIENT_SECRET` — Client Secret from the Spotify Developer Dashboard
   - `SESSION_SECRET` — random secret used to sign guest sessions
   - `EVENT_ACCESS_CODE_HASH` — SHA-256 hash of the event access code
6. Configure the same exact redirect URI in Spotify Developer Dashboard only when adding DJ account authorization later.

Do not add Spotify credentials to browser code or commit them to GitHub.


Do not commit secrets, tokens, event codes, or password values.

## Spotify

PartyQueue does not stream audio. Playback remains in the official Spotify app/player. Spotify Developer Mode eligibility, available scopes, and queue endpoint access must be verified in the developer dashboard before enabling the live dispatcher.

## Current functionality

- Guest registration with event code and nickname
- Signed 12-hour guest session
- Spotify catalogue search using the server-side Client Credentials flow
- Track requests stored in D1, with duplicate protection and per-guest limits

Spotify's February 2026 Development Mode rules apply. Search is limited to 10 results per request by Spotify; PartyQueue currently asks for 8. Playback control and the DJ dashboard are not implemented yet.
