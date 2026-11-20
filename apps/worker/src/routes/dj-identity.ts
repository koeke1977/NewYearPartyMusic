import { Hono } from "hono";
import type { Env } from "../platform/env";
import { constantTimeEqual, toBase64Url } from "../platform/security/crypto";
import { allowAuthAttempt } from "../platform/composition/auth-attempt-guard";
import { createSpotifyAuthorizationUrl, spotifyOAuthRedirectUri } from "../modules/identity/spotify-oauth";
import {
  completeSpotifyAuthorizationFromEnvironment,
} from "../platform/composition/spotify-oauth";
import { loginDjFromEnvironment } from "../platform/composition/dj-identity-workflows";
import { requireDJ } from "./dj-auth";

export const djIdentityRoutes = new Hono<{ Bindings: Env }>();

djIdentityRoutes.post("/api/dj/login", async (c) => {
  if (!await allowAuthAttempt(c.env, c.req.raw, "dj_login")) {
    return c.json({ error: "Te veel DJ-loginpogingen. Probeer het over 15 minuten opnieuw." }, 429, {
      "Retry-After": "900",
    });
  }
  let body: { code?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ongeldige aanvraag." }, 400);
  }
  const result = await loginDjFromEnvironment(
    c.env,
    typeof body.code === "string" ? body.code.trim() : "",
  );
  return c.json(result.body, result.status as 200 | 401 | 503);
});

djIdentityRoutes.post("/api/dj/spotify/connect", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen." }, 401);
  const state = toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const authorization = createSpotifyAuthorizationUrl({
    publicOrigin: c.env.PUBLIC_ORIGIN,
    clientId: c.env.SPOTIFY_CLIENT_ID,
  }, state);
  return c.json({ url: authorization.url }, {
    headers: {
      "Set-Cookie": "pq_spotify_state=" + state + "; HttpOnly; Secure; SameSite=Lax; Path=/auth/spotify/callback; Max-Age=600",
    },
  });
});

djIdentityRoutes.get("/auth/spotify/callback", async (c) => {
  const state = c.req.query("state") || "";
  const code = c.req.query("code") || "";
  const error = c.req.query("error");
  const cookie = c.req.header("Cookie") || "";
  const expected = cookie.match(/(?:^|; )pq_spotify_state=([^;]+)/)?.[1] || "";
  if (!state || !expected || !constantTimeEqual(state, expected)) {
    return c.text("Spotify-koppeling geweigerd: ongeldige OAuth-state.", 400);
  }
  const clearCookie = "pq_spotify_state=; HttpOnly; Secure; SameSite=Lax; Path=/auth/spotify/callback; Max-Age=0";
  if (error || !code) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/dj.html?spotify=denied", "Set-Cookie": clearCookie },
    });
  }
  const redirectUri = spotifyOAuthRedirectUri(c.env.PUBLIC_ORIGIN);
  const response = await completeSpotifyAuthorizationFromEnvironment(c.env, code, redirectUri);
  if (!response.ok) {
    return new Response("Spotify-tokenuitwisseling mislukt (HTTP " + response.status + ").", { status: 502 });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: "/dj.html?spotify=connected", "Set-Cookie": clearCookie },
  });
});
