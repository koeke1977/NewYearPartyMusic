import { Hono } from "hono";
import type { Env } from "../platform/env";
import { getDjOverview, reorderDjQueue, updateDjSetting } from "../modules/requests/application/dj-queue-management";
import { moderatePartyRequest } from "../modules/requests/application/guest-request-lifecycle";
import { requireDJSession } from "./dj-auth";
export const djRequestRoutes = new Hono<{ Bindings: Env }>();
djRequestRoutes.use("/api/dj/*", requireDJSession("DJ-sessie verlopen. Meld opnieuw aan."));
djRequestRoutes.get("/api/dj/overview", async (c) => {
  return c.json(await getDjOverview({ db: c.env.DB, eventId: c.env.EVENT_ID }));
});
djRequestRoutes.post("/api/dj/queue/reorder", async (c) => {
  let body: { order?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const result = await reorderDjQueue({ db: c.env.DB, eventId: c.env.EVENT_ID, order: body.order });
  return c.json(result.body, result.status as 200 | 400 | 409);
});
djRequestRoutes.post("/api/dj/requests/:id/:action", async (c) => {
  const result = await moderatePartyRequest({
    db:c.env.DB,eventId:c.env.EVENT_ID,requestId:c.req.param("id"),action:c.req.param("action"),
  });
  return c.json(result.body,result.status as 200);
});
djRequestRoutes.post("/api/dj/settings/:key", async (c) => {
  let body: { enabled?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const result = await updateDjSetting({ db: c.env.DB, key: c.req.param("key"), enabled: body.enabled });
  return c.json(result.body, result.status as 200 | 400);
});

