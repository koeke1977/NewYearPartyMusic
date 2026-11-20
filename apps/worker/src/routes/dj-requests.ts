import { Hono } from "hono";
import type { Env } from "../platform/env";
import {
  getDjOverviewFromEnvironment, moderatePartyRequestFromEnvironment,
  reorderDjQueueFromEnvironment, updateDjSettingFromEnvironment,
} from "../platform/composition/dj-request-workflows";
import { requireDJSession } from "./dj-auth";

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
  return c.json(result.body, result.status as 200 | 400 | 409);
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
  return c.json(result.body, result.status as 200 | 400);
});
