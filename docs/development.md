# Development checklist

## Sprint 0 — platform

- [x] Establish single-event scope and production hostname
- [x] Add repository scaffold, schema and visual landing page
- [ ] Create Cloudflare Worker and D1 database
- [ ] Set D1 database ID in wrangler.toml
- [ ] Attach spotify.electrafest.be as Worker custom domain
- [ ] Add server-side secrets

## Sprint 1 — Spotify proof of concept

- [ ] Create Spotify Developer app
- [ ] Set redirect URI to https://spotify.electrafest.be/auth/spotify/callback
- [ ] Verify Development Mode account and endpoint eligibility
- [ ] Implement Authorization Code flow with state validation
- [ ] Store and refresh tokens server-side
- [ ] Search Spotify tracks
- [ ] Read current playback state
- [ ] Test adding one track to Spotify queue

## Sprint 2 — guest app

- [ ] Event code entry
- [ ] Nickname and guest session
- [ ] Search results and artwork
- [ ] Submit request
- [ ] Request status and live queue

## Sprint 3 — DJ dashboard

- [ ] Protected DJ login
- [ ] Playback status
- [ ] Approve/reject requests
- [ ] Auto-approval setting
- [ ] Pause/resume request intake
- [ ] Serialized queue dispatcher and reconciliation

## Sprint 4 — hardening and rehearsal

- [ ] Rate limits and duplicate protection
- [ ] Concurrent request tests
- [ ] Expired token and Spotify outage handling
- [ ] Mobile browser testing
- [ ] QR code and event access code
- [ ] Multi-phone rehearsal
- [ ] Production deployment and rollback plan
