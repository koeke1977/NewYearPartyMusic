import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../apps/worker/src/platform/env";
import { guestRoutes } from "../../apps/worker/src/routes/guest";

function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api", guestRoutes);
  const env = {
    EVENT_ID: "event-1",
    EVENT_ACCESS_CODE_HASH: "configured-hash",
    SESSION_SECRET: "test-secret",
    DB: {} as D1Database,
  } as Env;
  return { app, env };
}

describe("guest HTTP routes", () => {
  it("rejects guest search without an event-scoped session", async () => {
    const { app, env } = createTestApp();
    const response = await app.request("/api/spotify/search?q=disco", {}, env);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Je sessie is verlopen. Meld je opnieuw aan.",
    });
  });

  it("rejects request submission without an event-scoped session", async () => {
    const { app, env } = createTestApp();
    const response = await app.request("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: "1234567890123456789012" }),
    }, env);
    expect(response.status).toBe(401);
  });

  it("returns the existing invalid-request response for malformed join JSON", async () => {
    const { app, env } = createTestApp();
    const response = await app.request("/api/guests/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }, env);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Ongeldige aanvraag." });
  });

  it("refuses guest join when the event access code is not configured", async () => {
    const { app, env } = createTestApp();
    const response = await app.request("/api/guests/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "Guest", eventCode: "1234" }),
    }, { ...env, EVENT_ACCESS_CODE_HASH: "" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "PartyQueue is not configured yet. Please contact the DJ.",
    });
  });
});
