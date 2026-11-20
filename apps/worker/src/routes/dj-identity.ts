import { Hono } from "hono";
import type { Env } from "../platform/env";
import { constantTimeEqual, sha256, toBase64Url } from "../platform/security/crypto";
import { createSessionToken } from "../modules/identity/session-token";
import { loginDj } from "../modules/identity/dj-session";
import { completeSpotifyAuthorization, createSpotifyAuthorizationUrl, spotifyOAuthRedirectUri } from "../modules/identity/spotify-oauth";
import { requireDJ } from "./dj-auth";
export const djIdentityRoutes = new Hono<{ Bindings: Env }>();
djIdentityRoutes.post("/api/dj/login", async (c) => {
  let body: { code?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const result = await loginDj({ code: typeof body.code === "string" ? body.code.trim() : "", expectedCodeHash: c.env.DJ_ACCESS_CODE_HASH, sessionSecret: c.env.SESSION_SECRET, eventId: c.env.EVENT_ID, hashCode: sha256, createToken: createSessionToken, nowSeconds: () => Math.floor(Date.now() / 1000) });
  return c.json(result.body, result.status as 200 | 401 | 503);
});
djIdentityRoutes.post("/api/dj/spotify/connect", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen." }, 401);
  const state = toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const authorization = createSpotifyAuthorizationUrl(c.env, state);
  return c.json({ url: authorization.url }, { headers: { "Set-Cookie": "pq_spotify_state=" + state + "; HttpOnly; Secure; SameSite=Lax; Path=/auth/spotify/callback; Max-Age=600" } });
});
djIdentityRoutes.get("/auth/spotify/callback", async (c) => {
  const state = c.req.query("state") || "", code = c.req.query("code") || "", error = c.req.query("error");
  const cookie = c.req.header("Cookie") || "";
  const expected = cookie.match(/(?:^|; )pq_spotify_state=([^;]+)/)?.[1] || "";
  if (!state || !expected || !constantTimeEqual(state, expected)) return c.text("Spotify-koppeling geweigerd: ongeldige OAuth-state.", 400);
  const clearCookie = "pq_spotify_state=; HttpOnly; Secure; SameSite=Lax; Path=/auth/spotify/callback; Max-Age=0";
  if (error || !code) return new Response(null, { status: 302, headers: { Location: "/dj.html?spotify=denied", "Set-Cookie": clearCookie } });
  const response = await completeSpotifyAuthorization(c.env, code, spotifyOAuthRedirectUri(c.env));
  if (!response.ok) return new Response("Spotify-tokenuitwisseling mislukt (HTTP " + response.status + ").", { status: 502 });
  return new Response(null, { status: 302, headers: { Location: "/dj.html?spotify=connected", "Set-Cookie": clearCookie } });
});
