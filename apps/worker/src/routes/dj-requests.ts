import { Hono } from "hono";
import type { Env } from "../platform/env";
import {
  getDjOverviewFromEnvironment, moderatePartyRequestFromEnvironment,
  reorderDjQueueFromEnvironment, updateDjSettingFromEnvironment,
} from "../platform/composition/dj-request-workflows";
import { requireDJSession } from "./dj-auth";
import { getAudienceIntelligenceFromEnvironment } from "../platform/composition/audience-intelligence-workflows";

export const djRequestRoutes = new Hono<{ Bindings: Env }>();

djRequestRoutes.use("/api/dj/*", requireDJSession("DJ-sessie verlopen. Meld opnieuw aan."));

djRequestRoutes.get("/api/dj/overview", async (c) => {
  return c.json(await getDjOverviewFromEnvironment(c.env));
});

djRequestRoutes.post("/api/dj/queue/reorder", async (c) => {
  let body: { order?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ongeldige aanvraag." }, 400);
  }
  const result = await reorderDjQueueFromEnvironment(c.env, body.order);
  if (!result.ok) return c.json({ error: result.error.message }, result.error.code === "invalid_order" ? 400 : 409);
  return c.json({ ok: true, order: result.value.order }, 200);
});

djRequestRoutes.post("/api/dj/requests/:id/:action", async (c) => {
  const result = await moderatePartyRequestFromEnvironment(c.env, c.req.param("id"), c.req.param("action"));
  return c.json(result.body, result.status as 200 | 404 | 409);
});

djRequestRoutes.post("/api/dj/settings/:key", async (c) => {
  let body: { enabled?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ongeldige aanvraag." }, 400);
  }
  const result = await updateDjSettingFromEnvironment(c.env, c.req.param("key"), body.enabled);
  if (!result.ok) return c.json({ error: result.error.message }, 400);
  return c.json({ ok: true, enabled: result.value.enabled }, 200);
});


djRequestRoutes.get("/api/dj/audience", async (c) => {
  return c.json(await getAudienceIntelligenceFromEnvironment(c.env));
});
