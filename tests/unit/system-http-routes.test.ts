import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../apps/worker/src/platform/env";
import { systemRoutes } from "../../apps/worker/src/routes/system";

describe("system HTTP routes", () => {
  it("returns the existing health payload fields", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.route("/", systemRoutes);
    const env = { EVENT_ID: "event-1", EVENT_NAME: "New Year", APP_ENV: "test" } as Env;
    const response = await app.request("/api/health", {}, env);
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      app: "PartyQueue",
      eventId: "event-1",
      eventName: "New Year",
      environment: "test",
    });
    expect(typeof body.timestamp).toBe("string");
  });

  it("keeps the public configuration contract", async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.route("/", systemRoutes);
    const response = await app.request("/api/config", {}, {
      EVENT_ID: "event-1",
      EVENT_NAME: "New Year",
    } as Env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      eventId: "event-1",
      eventName: "New Year",
      guestAccess: "event-code-and-nickname",
    });
  });
});
