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

## Cloudflare setup

1. Create a Worker named `partyqueue`.
2. Create a D1 database named `partyqueue-db`.
3. Replace the placeholder `database_id` in `wrangler.toml`.
4. Add the custom domain `spotify.electrafest.be` to the Worker.
5. Configure Worker secrets:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` = `https://spotify.electrafest.be/auth/spotify/callback`
   - `DJ_PASSWORD_HASH`
   - `EVENT_ACCESS_CODE_HASH`
6. Configure the same exact redirect URI in Spotify Developer Dashboard.

Do not commit secrets, tokens, event codes, or password values.

## Spotify

PartyQueue does not stream audio. Playback remains in the official Spotify app/player. Spotify Developer Mode eligibility, available scopes, and queue endpoint access must be verified in the developer dashboard before enabling the live dispatcher.

## Status

Initial project scaffold. The Worker health/config endpoints and visual guest landing page are the first implementation slice. OAuth and live Spotify queue integration are still pending.
