import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../apps/worker/src/platform/env";
import { djAiRoutes } from "../../apps/worker/src/routes/dj-ai";
import { djRequestRoutes } from "../../apps/worker/src/routes/dj-requests";
import { djPlaybackRoutes } from "../../apps/worker/src/routes/dj-playback";

describe("DJ feature route authorization", () => {
  const setup = () => {
    const app = new Hono<{ Bindings: Env }>();
    app.route("/", djAiRoutes);
    app.route("/", djRequestRoutes);
    app.route("/", djPlaybackRoutes);
    return {
      app,
      env: { EVENT_ID: "event-1", SESSION_SECRET: "test-secret", DB: {} as D1Database } as Env,
    };
  };

  const protectedRoutes: Array<{ name: string; path: string; method?: string; body?: unknown }> = [
    { name: "AI assistant", path: "/api/dj/ai/assistant", method: "POST", body: { prompt: "hello" } },
    { name: "AI music search", path: "/api/dj/ai/music/search", method: "POST", body: { queries: ["disco"] } },
    { name: "AI music add", path: "/api/dj/ai/music/add", method: "POST", body: { trackId: "1234567890123456789012" } },
    { name: "DJ overview", path: "/api/dj/overview" },
    { name: "queue reorder", path: "/api/dj/queue/reorder", method: "POST", body: { order: [] } },
    { name: "request moderation", path: "/api/dj/requests/request-1/approve", method: "POST" },
    { name: "DJ settings", path: "/api/dj/settings/guest_requests_enabled", method: "POST", body: { enabled: true } },
    { name: "Spotify playback status", path: "/api/dj/spotify/status" },
    { name: "Spotify devices", path: "/api/dj/spotify/devices" },
    { name: "Spotify next request", path: "/api/dj/spotify/next-request", method: "POST" },
    { name: "Spotify volume", path: "/api/dj/spotify/volume", method: "PUT", body: { volume: 30 } },
    { name: "Spotify transport", path: "/api/dj/spotify/play", method: "POST" },
    { name: "approved request dispatch", path: "/api/dj/spotify/queue/request-1", method: "POST" },
  ];

  for (const route of protectedRoutes) {
    it(`requires a DJ session for ${route.name}`, async () => {
      const { app, env } = setup();
      const headers = route.body ? { "Content-Type": "application/json" } : undefined;
      const response = await app.request(route.path, {
        method: route.method || "GET",
        headers,
        body: route.body ? JSON.stringify(route.body) : undefined,
      }, env);
      expect(response.status).toBe(401);
    });
  }
});
