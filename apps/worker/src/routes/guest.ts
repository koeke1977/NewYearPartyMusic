import { Hono } from "hono";
import type { Env } from "../platform/env";
import { sha256 } from "../platform/security/crypto";
import { createSessionToken, readSession } from "../modules/identity/session-token";
import { joinPartyGuest, submitGuestTrackRequest } from "../modules/requests/application/guest-request-lifecycle";
import { getSpotifyTrack, searchSpotifyTracks } from "../integrations/spotify/catalog-api";
import { searchGuestSpotifyTracks } from "../modules/music/application/search-spotify-tracks";

export const guestRoutes = new Hono<{ Bindings: Env }>();

guestRoutes.post("/guests/join", async (c) => {
  if (!c.env.EVENT_ACCESS_CODE_HASH || !c.env.SESSION_SECRET) {
    return c.json({ error: "PartyQueue is not configured yet. Please contact the DJ." }, 503);
  }
  let body: { nickname?: unknown; eventCode?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ongeldige aanvraag." }, 400);
  }
  const result = await joinPartyGuest({
    db: c.env.DB,
    eventId: c.env.EVENT_ID,
    nickname: typeof body.nickname === "string" ? body.nickname.trim() : "",
    eventCode: typeof body.eventCode === "string" ? body.eventCode.trim() : "",
    expectedCodeHash: c.env.EVENT_ACCESS_CODE_HASH,
    sessionSecret: c.env.SESSION_SECRET,
    hashCode: sha256,
    createToken: createSessionToken,
    createId: () => crypto.randomUUID(),
    nowSeconds: () => Math.floor(Date.now() / 1000),
  });
  return c.json(result.body, result.status as 200);
});

guestRoutes.get("/spotify/search", async (c) => {
  const session = await readSession(c.req.raw, c.env.SESSION_SECRET);
  if (!session || session.eventId !== c.env.EVENT_ID) {
    return c.json({ error: "Je sessie is verlopen. Meld je opnieuw aan." }, 401);
  }
  const result = await searchGuestSpotifyTracks({
    query: (c.req.query("q") || "").trim(),
    search: (query, limit) => searchSpotifyTracks(c.env, query, limit),
  });
  return c.json(result.body, result.status);
});

guestRoutes.post("/requests", async (c) => {
  const session = await readSession(c.req.raw, c.env.SESSION_SECRET);
  if (!session || session.eventId !== c.env.EVENT_ID) {
    return c.json({ error: "Je sessie is verlopen. Meld je opnieuw aan." }, 401);
  }
  let body: { trackId?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ongeldige aanvraag." }, 400);
  }
  const trackId = typeof body.trackId === "string" ? body.trackId.trim() : "";
  if (!/^[A-Za-z0-9]{22}$/.test(trackId)) {
    return c.json({ error: "Ongeldig Spotify-nummer." }, 400);
  }
  const result = await submitGuestTrackRequest({
    db: c.env.DB,
    eventId: session.eventId,
    guestId: session.sub,
    trackId,
    createId: () => crypto.randomUUID(),
    getSpotifyTrack: (id) => getSpotifyTrack(c.env, id),
  });
  return c.json(result.body, result.status as 200);
});
