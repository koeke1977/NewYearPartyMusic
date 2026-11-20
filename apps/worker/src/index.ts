import { Hono } from "hono";
import type { Env } from "./platform/env";
import { QueueRoom } from "./durable-objects/queue-room";
import { guestRoutes } from "./routes/guest";
import { djIdentityRoutes } from "./routes/dj-identity";
import { djAiRoutes } from "./routes/dj-ai";
import { djRequestRoutes } from "./routes/dj-requests";
import { djPlaybackRoutes } from "./routes/dj-playback";
import { systemRoutes } from "./routes/system";
import { handleScheduled } from "./scheduled/handler";

const app = new Hono<{ Bindings: Env }>();

app.route("/", systemRoutes);
app.route("/api", guestRoutes);
app.route("/", djIdentityRoutes);
app.route("/", djAiRoutes);
app.route("/", djRequestRoutes);
app.route("/", djPlaybackRoutes);

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export { QueueRoom };
export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};
