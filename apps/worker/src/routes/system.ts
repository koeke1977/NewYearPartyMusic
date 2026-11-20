import { Hono } from "hono";
import type { Env } from "../platform/env";

export const systemRoutes = new Hono<{ Bindings: Env }>();

systemRoutes.get("/api/health", (c) => c.json({
  ok: true,
  app: "PartyQueue",
  eventId: c.env.EVENT_ID,
  eventName: c.env.EVENT_NAME,
  environment: c.env.APP_ENV,
  timestamp: new Date().toISOString(),
}));

systemRoutes.get("/api/config", (c) => c.json({
  eventId: c.env.EVENT_ID,
  eventName: c.env.EVENT_NAME,
  guestAccess: "event-code-and-nickname",
}));
