import { Hono } from "hono";
import type { Env } from "../platform/env";
import { readSession } from "../platform/composition/session-token";
import { guestRequestErrorStatus } from "./guest-request-http";
import {
  joinGuestFromEnvironment, submitGuestRequestFromEnvironment, searchGuestTracksFromEnvironment,
} from "../platform/composition/guest-workflows";

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
  const result = await joinGuestFromEnvironment(
    c.env,
    typeof body.nickname === "string" ? body.nickname.trim() : "",
    typeof body.eventCode === "string" ? body.eventCode.trim() : "",
  );
  if (!result.ok) return c.json({ error: result.error.message }, guestRequestErrorStatus(result.error.code));
  return c.json({ ok: true, ...result.value }, 201);
});

guestRoutes.get("/spotify/search", async (c) => {
  const session = await readSession(c.req.raw, c.env.SESSION_SECRET);
  if (!session || session.eventId !== c.env.EVENT_ID) {
    return c.json({ error: "Je sessie is verlopen. Meld je opnieuw aan." }, 401);
  }
  const result = await searchGuestTracksFromEnvironment(c.env, (c.req.query("q") || "").trim());
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
  const result = await submitGuestRequestFromEnvironment(c.env, session.sub, trackId);
  if (!result.ok) return c.json({ error: result.error.message }, guestRequestErrorStatus(result.error.code));
  return c.json({ ok: true, request: result.value.request }, 201);
});
