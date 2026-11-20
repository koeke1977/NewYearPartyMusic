import { constantTimeEqual, fromBase64Url, signPayload, toBase64Url } from "../../platform/security/crypto";

const encoder = new TextEncoder();

export type Session = {
  sub: string;
  eventId: string;
  nickname: string;
  exp: number;
  role?: string;
};

/** Creates the existing signed bearer-token format without changing its payload or signature contract. */
export async function createSessionToken(session: Session, secret: string): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify(session)));
  return payload + "." + await signPayload(payload, secret);
}

/** Validates the existing HMAC-signed bearer token and returns null for every invalid/expired token. */
export async function readSession(request: Request, secret: string): Promise<Session | null> {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !secret) return null;

  try {
    const expected = await signPayload(payload, secret);
    if (!constantTimeEqual(signature, expected)) return null;

    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Session;
    if (!session.sub || !session.eventId || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}
