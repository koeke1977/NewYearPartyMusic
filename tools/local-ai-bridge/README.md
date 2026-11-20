# PartyQueue Local AI Bridge

A small Windows-friendly local service that lets the PartyQueue Worker request a DJ-assistant turn from the Claude Code CLI authenticated with an existing Claude account.

## What it does

- Runs on the DJ's own PC; no Anthropic API key is used by this bridge.
- Calls the installed `claude` CLI in print mode.
- Disables Claude Code tools for each turn: this is a text-only assistant, not an agent with shell, file or browser access.
- Requires a long bearer token, accepts only `system` and `user` text fields, serializes requests and applies a hard timeout/output limit.
- Binds to `127.0.0.1` by default. Do not bind it to the LAN or expose it directly to the internet.

The bridge does not make the Claude Pro quota unlimited. Claude's own subscription limits and Claude Code's current usage policy still apply. When Claude reports a usage limit, the bridge returns an error; it does not switch to API billing.

## Requirements

- Windows 10/11
- Node.js 22+
- Claude Code installed and authenticated with the Claude Pro account
- Cloudflare Tunnel only when you want the Cloudflare Worker to reach this PC remotely

## Start locally

In PowerShell:

```powershell
$env:LOCAL_AI_BRIDGE_TOKEN = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
node .\tools\local-ai-bridge\server.mjs
```

Keep the generated token safe; it must also be configured as a Worker secret. The service listens on `http://127.0.0.1:8787`.

Check health:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

## Expose it safely with Cloudflare Tunnel

Create a named Cloudflare Tunnel in your account and route a dedicated hostname (for example `partyqueue-ai.your-domain.example`) to `http://localhost:8787`. Use Cloudflare Access service-token protection as an additional edge layer if your account supports it. Do not use a temporary public quick tunnel for a permanent production integration.

The bridge itself still requires its bearer token. Never publish the token in the browser, guest app, repository, URL, logs or a client-side environment variable. Configure the Worker endpoint and token only as Worker secrets/variables. Keep the bridge's local listener on loopback.

## Claude Code subscription and policy note

The bridge invokes the supported Claude Code CLI, not the Anthropic Messages API. Sign in interactively using Claude Code's supported account login flow before starting the service. Do not put API keys in this bridge. If Claude Code asks for API billing or the subscription does not authorize a requested usage mode, stop; do not bypass the account's limits or switch billing silently.

Check Anthropic's current Claude Code documentation and subscription terms before using this as an unattended long-running service. This bridge is an experimental local integration and is not an Anthropic-hosted production API.

## Spotify data boundary

PartyQueue's existing Spotify policy boundary remains in force. Do not send Spotify catalogue results, song titles/artists obtained from Spotify, album art, live queue state, playback state, guest request rows or derived request metrics to this bridge. It only accepts the Spotify-independent system/user prompt produced by PartyQueue. Track ideas returned by AI remain unverified ideas for the DJ to search manually.
