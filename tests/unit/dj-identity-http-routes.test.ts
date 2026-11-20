import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { Env } from "../../apps/worker/src/platform/env";
import { djIdentityRoutes } from "../../apps/worker/src/routes/dj-identity";
import { sha256 } from "../../apps/worker/src/platform/security/crypto";
import { readDjSession } from "../../apps/worker/src/modules/identity/dj-session";
import { readSession } from "../../apps/worker/src/platform/composition/session-token";

describe("DJ identity HTTP routes", () => {
  const create = () => {
    const app = new Hono<{ Bindings: Env }>();
    app.route("/", djIdentityRoutes);
    return {
      app,
      env: {
        EVENT_ID: "event-1", DJ_ACCESS_CODE_HASH: "expected-hash", SESSION_SECRET: "test-secret",
        PUBLIC_ORIGIN: "https://party.example", SPOTIFY_CLIENT_ID: "client-id",
      } as Env,
    };
  };

  it("preserves malformed login JSON handling", async () => {
    const { app, env } = create();
    const response = await app.request("/api/dj/login", {
      method: "POST", body: "{", headers: { "Content-Type": "application/json" },
    }, env);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Ongeldige aanvraag." });
  });

  it("returns unavailable when DJ access is not configured", async () => {
    const { app, env } = create();
    const response = await app.request("/api/dj/login", {
      method: "POST", body: JSON.stringify({ code: "1234" }),
      headers: { "Content-Type": "application/json" },
    }, { ...env, DJ_ACCESS_CODE_HASH: "" });
    expect(response.status).toBe(503);
  });

  it("rejects Spotify connect without a valid DJ session", async () => {
    const { app, env } = create();
    expect((await app.request("/api/dj/spotify/connect", { method: "POST" }, env)).status).toBe(401);
  });

  it("rejects a callback with missing or mismatched OAuth state", async () => {
    const { app, env } = create();
    const response = await app.request("/auth/spotify/callback?state=attacker&code=code", {}, env);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("ongeldige OAuth-state");
  });

  it("issues a valid eight-hour DJ session after a correct code", async () => {
    const { app, env } = create();
    const response = await app.request("/api/dj/login", {
      method: "POST", body: JSON.stringify({ code: "correct" }),
      headers: { "Content-Type": "application/json" },
    }, { ...env, DJ_ACCESS_CODE_HASH: await sha256("correct") });
    expect(response.status).toBe(200);
    const body = await response.json() as { token: string; expiresAt: number };
    expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 7 * 60 * 60);
    expect(await readDjSession(
      new Request("https://party.example", { headers: { Authorization: "Bearer " + body.token } }),
      env.SESSION_SECRET, env.EVENT_ID, readSession,
    )).not.toBeNull();
  });
});
