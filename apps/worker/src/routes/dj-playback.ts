import { Hono } from "hono";
import type { Env } from "../platform/env";
import {
  executeDjSpotifyCommandFromEnvironment, getDjSpotifyPlaybackStatusFromEnvironment,
  listDjSpotifyDevicesFromEnvironment, setDjSpotifyVolumeFromEnvironment,
  startNextPartyQueueRequest,
} from "../platform/composition/dj-playback-workflows";
import { queueApprovedPartyRequestFromEnvironment } from "../platform/composition/dj-request-workflows";
import { requireDJSession } from "./dj-auth";

export const djPlaybackRoutes = new Hono<{ Bindings: Env }>();

djPlaybackRoutes.use("/api/dj/*", requireDJSession());

djPlaybackRoutes.get("/api/dj/spotify/status", async (c) => {
  const result = await getDjSpotifyPlaybackStatusFromEnvironment(c.env);
  return c.json(result.body, result.status);
});

djPlaybackRoutes.get("/api/dj/spotify/devices", async (c) => {
  const result = await listDjSpotifyDevicesFromEnvironment(c.env);
  return c.json(result.body, result.status);
});

djPlaybackRoutes.post("/api/dj/spotify/next-request", async (c) => {
  const result = await startNextPartyQueueRequest(c.env);
  if (result.busy) {
    return c.json({ ok: false, busy: true, error: result.error || "Een andere NEXT-actie wordt al verwerkt." });
  }
  if (!result.ok) {
    return c.json({ error: result.error || "Volgende aanvraag starten is mislukt." }, 409);
  }
  return c.json({ ok: true, track: result.track, requestId: result.requestId });
});

djPlaybackRoutes.put("/api/dj/spotify/volume", async (c) => {
  let body: { volume?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ongeldige aanvraag." }, 400);
  }
  const result = await setDjSpotifyVolumeFromEnvironment(c.env, body.volume);
  return c.json(result.body, result.status);
});

djPlaybackRoutes.post("/api/dj/spotify/:action", async (c) => {
  const result = await executeDjSpotifyCommandFromEnvironment(c.env, c.req.param("action"));
  return c.json(result.body, result.status);
});

djPlaybackRoutes.post("/api/dj/spotify/queue/:id", async (c) => {
  const result = await queueApprovedPartyRequestFromEnvironment(c.env, c.req.param("id"));
  return c.json(result.body, result.status as 200 | 409);
});
