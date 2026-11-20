import { Hono } from "hono";
import type { Env } from "../platform/env";
import { executeDJAssistantFromEnvironment } from "../platform/composition/ai-assistant";
import { addDjTrackFromEnvironment, searchDjTracksFromEnvironment } from "../platform/composition/guest-workflows";
import { requireDJSession } from "./dj-auth";
export const djAiRoutes = new Hono<{ Bindings: Env }>();
djAiRoutes.use("/api/dj/*", requireDJSession("DJ-sessie verlopen. Meld opnieuw aan."));
djAiRoutes.post("/api/dj/ai/assistant", async (c) => {
  let body: { prompt?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 600) return c.json({ error: "Stel een vraag van maximaal 600 tekens." }, 400);
  const result = await executeDJAssistantFromEnvironment(c.env, prompt);
  return c.json(result.body, result.status as 200 | 429 | 503 | 502);
});
djAiRoutes.post("/api/dj/ai/music/search", async (c) => {
  let body: { queries?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const result = await searchDjTracksFromEnvironment(c.env, body.queries);
  return c.json(result.body, result.status);
});
djAiRoutes.post("/api/dj/ai/music/add", async (c) => {
  let body: { trackId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const trackId = typeof body.trackId === "string" ? body.trackId.trim() : "";
  if (!/^[A-Za-z0-9]{22}$/.test(trackId)) return c.json({ error: "Ongeldig Spotify-track-ID." }, 400);
  const result = await addDjTrackFromEnvironment(c.env, trackId);
  return c.json(result.body,result.status as 200);
});
