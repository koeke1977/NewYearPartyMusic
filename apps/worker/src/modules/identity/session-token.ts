export type Session = {
  sub: string;
  eventId: string;
  nickname: string;
  exp: number;
  role?: string;
};

/** Cryptographic operations required by the signed session-token policy. */
export type SessionTokenCrypto = {
  toBase64Url(bytes: Uint8Array): string;
  fromBase64Url(value: string): Uint8Array;
  signPayload(payload: string, secret: string): Promise<string>;
  constantTimeEqual(a: string, b: string): boolean;
};

const encoder = new TextEncoder();

/** Creates the existing signed bearer-token format without changing its payload or signature contract. */
export async function createSessionToken(
  session: Session,
  secret: string,
  crypto: SessionTokenCrypto,
): Promise<string> {
  const payload = crypto.toBase64Url(encoder.encode(JSON.stringify(session)));
  return payload + "." + await crypto.signPayload(payload, secret);
}

/** Validates the existing HMAC-signed bearer token and returns null for every invalid/expired token. */
export async function readSession(
  request: Request,
  secret: string,
  crypto: SessionTokenCrypto,
): Promise<Session | null> {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !secret) return null;

  try {
    const expected = await crypto.signPayload(payload, secret);
    if (!crypto.constantTimeEqual(signature, expected)) return null;

    const session = JSON.parse(new TextDecoder().decode(crypto.fromBase64Url(payload))) as Session;
    if (!session.sub || !session.eventId || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}
