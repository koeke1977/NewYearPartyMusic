import { Hono } from "hono";
import type { Env } from "../platform/env";
import { executeDJAssistant } from "../modules/ai/application/execute-dj-assistant";
import { addDjTrackToPartyQueue } from "../modules/requests/application/guest-request-lifecycle";
import { searchDjSpotifyTracks } from "../modules/music/application/search-spotify-tracks";
import { searchSpotifyTracks, getSpotifyTrack } from "../integrations/spotify/catalog-api";
import { requireDJSession } from "./dj-auth";
export const djAiRoutes = new Hono<{ Bindings: Env }>();
djAiRoutes.use("/api/dj/*", requireDJSession("DJ-sessie verlopen. Meld opnieuw aan."));
djAiRoutes.post("/api/dj/ai/assistant", async (c) => {
  let body: { prompt?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 600) return c.json({ error: "Stel een vraag van maximaal 600 tekens." }, 400);

  const result = await executeDJAssistant(c.env, prompt);
  return c.json(result.body, result.status as 200 | 429 | 503 | 502);
});
djAiRoutes.post("/api/dj/ai/music/search", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  let body: { queries?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const result = await searchDjSpotifyTracks({
    queries: body.queries,
    search: (query, limit) => searchSpotifyTracks(c.env, query, limit),
  });
  return c.json(result.body, result.status);
});
djAiRoutes.post("/api/dj/ai/music/add", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  let body: { trackId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const trackId = typeof body.trackId === "string" ? body.trackId.trim() : "";
  if (!/^[A-Za-z0-9]{22}$/.test(trackId)) return c.json({ error: "Ongeldig Spotify-track-ID." }, 400);
  const result = await addDjTrackToPartyQueue({
    db: c.env.DB,eventId: c.env.EVENT_ID,trackId,createId:()=>crypto.randomUUID(),
    getSpotifyTrack:(id)=>getSpotifyTrack(c.env,id),
  });
  return c.json(result.body,result.status as 200);
});
