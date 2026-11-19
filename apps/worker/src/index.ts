import { Hono } from "hono";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  EVENT_ID: string;
  EVENT_NAME: string;
  APP_ENV: string;
  PUBLIC_ORIGIN: string;
  QUEUE_ROOM: DurableObjectNamespace;
  EVENT_ACCESS_CODE_HASH: string;
  SESSION_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();
const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function signSession(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    app: "PartyQueue",
    eventId: c.env.EVENT_ID,
    eventName: c.env.EVENT_NAME,
    environment: c.env.APP_ENV,
    timestamp: new Date().toISOString(),
  }),
);

app.get("/api/config", (c) =>
  c.json({
    eventId: c.env.EVENT_ID,
    eventName: c.env.EVENT_NAME,
    guestAccess: "event-code-and-nickname",
  }),
);

app.post("/api/guests/join", async (c) => {
  if (!c.env.EVENT_ACCESS_CODE_HASH || !c.env.SESSION_SECRET) {
    return c.json({ error: "PartyQueue is not configured yet. Please contact the DJ." }, 503);
  }

  let body: { nickname?: unknown; eventCode?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ongeldige aanvraag." }, 400);
  }

  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
  const eventCode = typeof body.eventCode === "string" ? body.eventCode.trim() : "";

  if (nickname.length < 2 || nickname.length > 24 || !eventCode || eventCode.length > 32) {
    return c.json({ error: "Vul een nickname (2–24 tekens) en de feestcode in." }, 400);
  }

  const suppliedHash = await sha256(eventCode);
  if (suppliedHash !== c.env.EVENT_ACCESS_CODE_HASH.trim().toLowerCase()) {
    return c.json({ error: "Die feestcode klopt niet. Vraag de DJ om de juiste code." }, 401);
  }

  const event = await c.env.DB.prepare(
    "SELECT id, name FROM events WHERE id = ? AND is_active = 1 LIMIT 1",
  ).bind(c.env.EVENT_ID).first<{ id: string; name: string }>();

  if (!event) {
    return c.json({ error: "Dit feest is momenteel niet actief." }, 403);
  }

  const guestId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO guests (id, event_id, nickname) VALUES (?, ?, ?)",
  ).bind(guestId, event.id, nickname).run();

  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    sub: guestId,
    eventId: event.id,
    nickname,
    exp: expiresAt,
  })));
  const token = payload + "." + await signSession(payload, c.env.SESSION_SECRET);

  return c.json({
    ok: true,
    guest: { id: guestId, nickname },
    sessionToken: token,
    expiresAt,
  }, 201);
});

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export class QueueRoom {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "queue-room" });
    }
    return new Response("Not found", { status: 404 });
  }
}

export default app;
