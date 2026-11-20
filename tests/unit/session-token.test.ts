import { describe, expect, it } from "vitest";
import { createSessionToken, readSession } from "../../apps/worker/src/platform/composition/session-token";
import type { Session } from "../../apps/worker/src/modules/identity/session-token";

const encoder = new TextEncoder();

function requestWithToken(token: string): Request {
  return new Request("https://partyqueue.test/api/dj/overview", {
    headers: { Authorization: "Bearer " + token },
  });
}

async function legacyToken(session: Session, secret: string): Promise<string> {
  const payloadBytes = encoder.encode(JSON.stringify(session));
  let binary = "";
  for (const byte of payloadBytes) binary += String.fromCharCode(byte);
  const payload = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  let signatureBinary = "";
  for (const byte of new Uint8Array(signature)) signatureBinary += String.fromCharCode(byte);
  const encodedSignature = btoa(signatureBinary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return payload + "." + encodedSignature;
}

describe("identity session tokens", () => {
  const secret = "partyqueue-session-test-secret";
  const validSession: Session = {
    sub: "guest-123",
    eventId: "NYE2026",
    nickname: "Disco Koen",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  it("creates and reads a valid guest session", async () => {
    const token = await createSessionToken(validSession, secret);
    await expect(readSession(requestWithToken(token), secret)).resolves.toEqual(validSession);
  });

  it("continues to accept tokens created by the original inline implementation", async () => {
    const token = await legacyToken(validSession, secret);
    await expect(readSession(requestWithToken(token), secret)).resolves.toEqual(validSession);
  });

  it("rejects expired sessions", async () => {
    const token = await createSessionToken({ ...validSession, exp: 1 }, secret);
    await expect(readSession(requestWithToken(token), secret)).resolves.toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken(validSession, secret);
    const [payload, signature] = token.split(".");
    const replacement = signature[0] === "A" ? "B" : "A";
    await expect(readSession(requestWithToken(payload + "." + replacement + signature.slice(1)), secret)).resolves.toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await createSessionToken(validSession, secret);
    await expect(readSession(requestWithToken(token), "different-secret")).resolves.toBeNull();
  });

  it("rejects missing, malformed and extra-segment bearer tokens", async () => {
    await expect(readSession(new Request("https://partyqueue.test"), secret)).resolves.toBeNull();
    await expect(readSession(requestWithToken("not-a-token"), secret)).resolves.toBeNull();
    await expect(readSession(requestWithToken("a.b.c"), secret)).resolves.toBeNull();
  });
});
