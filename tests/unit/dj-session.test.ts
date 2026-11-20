import { describe, expect, it, vi } from "vitest";
import { createSessionToken } from "../../apps/worker/src/modules/identity/session-token";
import { loginDj, readDjSession } from "../../apps/worker/src/modules/identity/dj-session";

describe("DJ session", () => {
  it("issues an eight-hour DJ token after validating the configured code", async () => {
    const createToken = vi.fn(async () => "signed-dj-token");
    const result = await loginDj({
      code: "correct-code", expectedCodeHash: "expected-hash", sessionSecret: "secret",
      eventId: "event-1", hashCode: async value => value === "correct-code" ? "expected-hash" : "wrong",
      createToken, nowSeconds: () => 1000,
    });
    expect(result).toEqual({ status: 200, body: { ok: true, token: "signed-dj-token", expiresAt: 29800 } });
    expect(createToken).toHaveBeenCalledWith({
      sub: "dj", eventId: "event-1", nickname: "DJ", role: "dj", exp: 29800,
    }, "secret");
  });

  it("rejects missing configuration, wrong codes and overlong codes", async () => {
    const base = {
      code: "wrong", expectedCodeHash: "expected", sessionSecret: "secret", eventId: "event-1",
      hashCode: async () => "wrong", createToken: async () => "token", nowSeconds: () => 1000,
    };
    expect(await loginDj({ ...base, expectedCodeHash: "" })).toMatchObject({ status: 503 });
    expect(await loginDj(base)).toMatchObject({ status: 401 });
    expect(await loginDj({ ...base, code: "x".repeat(65), hashCode: vi.fn() })).toMatchObject({ status: 401 });
  });

  it("accepts only a valid DJ session for the configured event", async () => {
    const token = await createSessionToken({
      sub: "dj", eventId: "event-1", nickname: "DJ", role: "dj",
      exp: Math.floor(Date.now() / 1000) + 300,
    }, "secret");
    const request = new Request("https://party.example/api/dj/overview", {
      headers: { Authorization: "Bearer " + token },
    });
    expect(await readDjSession(request, "secret", "event-1")).toMatchObject({ role: "dj", eventId: "event-1" });
    expect(await readDjSession(request, "secret", "event-2")).toBeNull();

    const guestToken = await createSessionToken({
      sub: "guest-1", eventId: "event-1", nickname: "Guest",
      exp: Math.floor(Date.now() / 1000) + 300,
    }, "secret");
    const guestRequest = new Request("https://party.example/api/dj/overview", {
      headers: { Authorization: "Bearer " + guestToken },
    });
    expect(await readDjSession(guestRequest, "secret", "event-1")).toBeNull();
  });
});
