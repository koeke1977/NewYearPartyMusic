import { createSessionToken, readSession, type Session } from "./session-token";

type Result = { status: number; body: Record<string, unknown> };

export async function loginDj(input: {
  code: string;
  expectedCodeHash: string;
  sessionSecret: string;
  eventId: string;
  hashCode(value: string): Promise<string>;
  createToken(payload: Session, secret: string): Promise<string>;
  nowSeconds(): number;
}): Promise<Result> {
  if (!input.expectedCodeHash) {
    return { status: 503, body: { error: "DJ-toegang is nog niet geconfigureerd." } };
  }
  if (!input.code || input.code.length > 64
    || (await input.hashCode(input.code)) !== input.expectedCodeHash.trim().toLowerCase()) {
    return { status: 401, body: { error: "Onjuiste DJ-code." } };
  }
  const expiresAt = input.nowSeconds() + 28800;
  const token = await input.createToken({
    sub: "dj", eventId: input.eventId, nickname: "DJ", role: "dj", exp: expiresAt,
  }, input.sessionSecret);
  return { status: 200, body: { ok: true, token, expiresAt } };
}

export async function readDjSession(
  request: Request,
  sessionSecret: string,
  eventId: string,
): Promise<Session | null> {
  const session = await readSession(request, sessionSecret);
  if (!session || session.role !== "dj" || session.eventId !== eventId) return null;
  return session;
}
