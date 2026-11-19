import { Hono } from "hono";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  EVENT_ID: string;
  EVENT_NAME: string;
  APP_ENV: string;
  PUBLIC_ORIGIN: string;
  QUEUE_ROOM: DurableObjectNamespace;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    app: "PartyQueue",
    eventId: c.env.EVENT_ID,
    eventName: c.env.EVENT_NAME,
    environment: c.env.APP_ENV,
    timestamp: new Date().toISOString(),
  }),
);

app.get("/api/config", (c) =>
  c.json({
    eventId: c.env.EVENT_ID,
    eventName: c.env.EVENT_NAME,
    guestAccess: "event-code-and-nickname",
  }),
);

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export class QueueRoom {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "queue-room" });
    }
    return new Response("Not found", { status: 404 });
  }
}

export default app;
