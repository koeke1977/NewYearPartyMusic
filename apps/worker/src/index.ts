import { Hono } from "hono";
import type { Env } from "./platform/env";
import { cleanupCompletedRequests } from "./modules/requests/application/cleanup-completed-requests";
import { QueueRoom } from "./durable-objects/queue-room";
import { guestRoutes } from "./routes/guest";
import { djIdentityRoutes } from "./routes/dj-identity";
import { djAiRoutes } from "./routes/dj-ai";
import { djRequestRoutes } from "./routes/dj-requests";
import { djPlaybackRoutes } from "./routes/dj-playback";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({
  ok: true, app: "PartyQueue", eventId: c.env.EVENT_ID, eventName: c.env.EVENT_NAME,
  environment: c.env.APP_ENV, timestamp: new Date().toISOString(),
}));
app.get("/api/config", (c) => c.json({
  eventId: c.env.EVENT_ID, eventName: c.env.EVENT_NAME, guestAccess: "event-code-and-nickname",
}));

app.route("/api", guestRoutes);
app.route("/", djIdentityRoutes);
app.route("/", djAiRoutes);
app.route("/", djRequestRoutes);
app.route("/", djPlaybackRoutes);

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export { QueueRoom };
export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanupCompletedRequests(env.DB));
  }
};
