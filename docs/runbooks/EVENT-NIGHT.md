# Event-night runbook

**Purpose:** Keep the single-evening PartyQueue event predictable. This is an operator checklist, not a deployment or production-release procedure.

## Before guests arrive

- [ ] Open `https://spotify.electrafest.be` on the DJ laptop and confirm the guest page loads.
- [ ] Open `https://spotify.electrafest.be/api/health` and confirm the Worker responds.
- [ ] Open the DJ console, sign in, and confirm the correct event is shown.
- [ ] Confirm Spotify is connected to the intended host account.
- [ ] Open the official Spotify app/player, select the intended output device or PA path, and verify that audio is actually audible through the event sound system.
- [ ] Test play, pause, skip and volume from the DJ console. A connected Spotify account or green status indicator alone does not prove that the PA path works.
- [ ] Check the DJ console's current request settings and queue. Do not assume seed/default settings are still active.
- [ ] Keep the DJ laptop on power, disable sleep/hibernation for the event, and keep a stable network connection.
- [ ] Prepare a fallback playlist in the official Spotify app. It is a manual fallback, not a queue synchronized with PartyQueue.
- [ ] Put the guest QR code and event code where guests can scan/read them.

### Optional end-to-end smoke test

Only perform a live test request if the event operator explicitly approves it. Use one clearly identifiable test track, confirm that it appears in the DJ queue, then remove it and verify that it is gone. Do not leave test activity in the live audience profile.

**FLUSH is destructive.** If the event data must be reset, do it only before guests arrive, after confirming the production environment and event, and after explicit operator approval. Never use FLUSH as a troubleshooting or refresh action.

## During the event

- PartyQueue is the source of truth for requests, queue order and played state. Spotify UP NEXT is the downstream playback view populated from PartyQueue; do not manage the same queue independently in both places.
- Keep the DJ console open and periodically check the current track, queue order, pending requests and Spotify connection.
- Approve, reject, reorder and remove tracks from the DJ console.
- AI advice and suggestions are optional. An unverified suggestion is not a confirmed queue change; only trust the action result reported by PartyQueue.
- Autopilot is OFF by default and is add-only. Enable it only deliberately, while monitoring its last-run/result status. It cannot replace DJ control of playback.
- Do not run deployments, database migrations, data resets, secret changes or infrastructure maintenance during the party.

## Recovery playbook

### Guest page or DJ console stops responding

1. Leave the current Spotify track playing if audio is still working.
2. Refresh the affected browser page once.
3. Check the health endpoint and the DJ console's Spotify connection.
4. If PartyQueue is still unavailable, stop inviting guests to submit requests and switch to the prepared Spotify fallback playlist manually. Do not assume the fallback playlist is synchronized with the PartyQueue queue.
5. Do not reset D1, run FLUSH, redeploy or change Worker configuration during the event.

### Spotify playback stops or the device disappears

1. Check the official Spotify app/player and select the intended playback device.
2. Confirm the host account is still signed in and the device is online.
3. Retry the playback command from the DJ console.
4. If the connection is lost, use the normal Spotify reconnect flow from the DJ console and retry.
5. If playback cannot be restored quickly, use the prepared fallback playlist directly in Spotify. Treat it as a manual fallback; reconcile the PartyQueue state before resuming normal queue dispatch.

### AI assistant or local AI bridge fails

1. Continue operating the queue manually; AI is not required for guest requests or DJ playback.
2. If Autopilot is enabled, turn it OFF in the DJ console.
3. Do not repeatedly retry prompts or change provider secrets during the event.
4. Resume AI use only after the service is healthy and the DJ has checked the queue.

## After the event

- [ ] Pause new guest requests.
- [ ] Turn Autopilot OFF.
- [ ] Let the current track finish or stop playback deliberately.
- [ ] Confirm the final queue state before closing the DJ console.
- [ ] Do not run FLUSH immediately. Retain event data until the organizer has decided whether it is needed for review; any later reset remains an explicit, destructive operation.
- [ ] Do not disconnect Spotify merely as routine cleanup if the same host connection is needed for the next session.

## Important boundaries

- PartyQueue controls the queue and sends playback commands; audio is played by the official Spotify app/player.
- Browser journey tests use deterministic API stubs. They do not test a real Spotify account, the event network, the PA device or live Cloudflare production resources.
- Production deployment and production D1 changes follow `PRODUCTION-READINESS.md` and require explicit approval.
