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
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
}

type Session = { sub: string; eventId: string; nickname: string; exp: number };
type SpotifyTrack = {
  id: string; uri: string; name: string; duration_ms: number;
  artists: { name: string }[];
  album: { images?: { url: string; width?: number; height?: number }[] };
};

const app = new Hono<{ Bindings: Env }>();
const encoder = new TextEncoder();
let spotifyToken: { value: string; expiresAt: number } | null = null;

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
async function signSession(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}
async function readSession(request: Request, secret: string): Promise<Session | null> {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !secret) return null;
  try {
    const expected = await signSession(payload, secret);
    const a = encoder.encode(signature);
    const b = encoder.encode(expected);
    if (a.length !== b.length || !crypto.subtle.timingSafeEqual) {
      if (signature !== expected) return null;
    } else if (!crypto.subtle.timingSafeEqual(a, b)) return null;
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Session;
    if (!session.sub || !session.eventId || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch { return null; }
}
async function getSpotifyToken(env: Env): Promise<string> {
  if (spotifyToken && spotifyToken.expiresAt > Date.now() + 60_000) return spotifyToken.value;
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) throw new Error("Spotify API is nog niet geconfigureerd.");
  const credentials = btoa(env.SPOTIFY_CLIENT_ID + ":" + env.SPOTIFY_CLIENT_SECRET);
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: "Basic " + credentials, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("Spotify kon geen API-token leveren (HTTP " + response.status + ").");
  const data = await response.json() as { access_token: string; expires_in: number };
  spotifyToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

app.get("/api/health", (c) => c.json({
  ok: true, app: "PartyQueue", eventId: c.env.EVENT_ID, eventName: c.env.EVENT_NAME,
  environment: c.env.APP_ENV, timestamp: new Date().toISOString(),
}));
app.get("/api/config", (c) => c.json({
  eventId: c.env.EVENT_ID, eventName: c.env.EVENT_NAME, guestAccess: "event-code-and-nickname",
}));

app.post("/api/guests/join", async (c) => {
  if (!c.env.EVENT_ACCESS_CODE_HASH || !c.env.SESSION_SECRET) return c.json({ error: "PartyQueue is not configured yet. Please contact the DJ." }, 503);
  let body: { nickname?: unknown; eventCode?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
  const eventCode = typeof body.eventCode === "string" ? body.eventCode.trim() : "";
  if (nickname.length < 2 || nickname.length > 24 || !eventCode || eventCode.length > 32) return c.json({ error: "Vul een nickname (2–24 tekens) en de feestcode in." }, 400);
  if ((await sha256(eventCode)) !== c.env.EVENT_ACCESS_CODE_HASH.trim().toLowerCase()) return c.json({ error: "Die feestcode klopt niet. Vraag de DJ om de juiste code." }, 401);
  const event = await c.env.DB.prepare("SELECT id FROM events WHERE id = ? AND is_active = 1 LIMIT 1").bind(c.env.EVENT_ID).first<{ id: string }>();
  if (!event) return c.json({ error: "Dit feest is momenteel niet actief." }, 403);
  const guestId = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO guests (id, event_id, nickname) VALUES (?, ?, ?)").bind(guestId, event.id, nickname).run();
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const payload = toBase64Url(encoder.encode(JSON.stringify({ sub: guestId, eventId: event.id, nickname, exp: expiresAt })));
  const token = payload + "." + await signSession(payload, c.env.SESSION_SECRET);
  return c.json({ ok: true, guest: { id: guestId, nickname }, sessionToken: token, expiresAt }, 201);
});

app.get("/api/spotify/search", async (c) => {
  const session = await readSession(c.req.raw, c.env.SESSION_SECRET);
  if (!session || session.eventId !== c.env.EVENT_ID) return c.json({ error: "Je sessie is verlopen. Meld je opnieuw aan." }, 401);
  const query = (c.req.query("q") || "").trim();
  if (query.length < 2 || query.length > 100) return c.json({ error: "Zoek op minstens 2 en maximaal 100 tekens." }, 400);
  try {
    const token = await getSpotifyToken(c.env);
    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "track");
    url.searchParams.set("limit", "8");
    const response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (response.status === 429) return c.json({ error: "Spotify krijgt even veel zoekopdrachten. Probeer zo meteen opnieuw." }, 429);
    if (!response.ok) return c.json({ error: "Spotify zoeken is mislukt (HTTP " + response.status + ")." }, 502);
    const data = await response.json() as { tracks?: { items?: SpotifyTrack[] } };
    const tracks = (data.tracks?.items || []).map((track) => ({
      id: track.id, uri: track.uri, name: track.name,
      artists: track.artists.map((artist) => artist.name),
      albumImageUrl: track.album.images?.[1]?.url || track.album.images?.[0]?.url || null,
      durationMs: track.duration_ms,
    }));
    return c.json({ tracks, attribution: "Music data provided by Spotify" });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Spotify is tijdelijk niet beschikbaar." }, 503);
  }
});

app.post("/api/requests", async (c) => {
  const session = await readSession(c.req.raw, c.env.SESSION_SECRET);
  if (!session || session.eventId !== c.env.EVENT_ID) return c.json({ error: "Je sessie is verlopen. Meld je opnieuw aan." }, 401);
  let body: { trackId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const trackId = typeof body.trackId === "string" ? body.trackId.trim() : "";
  if (!/^[A-Za-z0-9]{22}$/.test(trackId)) return c.json({ error: "Ongeldig Spotify-nummer." }, 400);

  const guest = await c.env.DB.prepare("SELECT id FROM guests WHERE id = ? AND event_id = ?").bind(session.sub, session.eventId).first();
  if (!guest) return c.json({ error: "Gast niet gevonden. Meld je opnieuw aan." }, 401);

  const settings = await c.env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('requests_paused','max_open_requests_per_guest','max_requests_per_30_minutes','auto_approve')").all<{ key: string; value: string }>();
  const config = Object.fromEntries((settings.results || []).map((row) => [row.key, row.value]));
  if (config.requests_paused === "true") return c.json({ error: "De DJ heeft aanvragen tijdelijk gepauzeerd." }, 403);

  const openLimit = Number(config.max_open_requests_per_guest || 2);
  const rateLimit = Number(config.max_requests_per_30_minutes || 5);
  const openCount = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM requests WHERE guest_id = ? AND status IN ('pending','approved','queued')").bind(session.sub).first<{ count: number }>();
  if ((openCount?.count || 0) >= openLimit) return c.json({ error: "Je hebt al " + openLimit + " openstaande aanvragen." }, 429);
  const recentCount = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM requests WHERE guest_id = ? AND requested_at >= datetime('now','-30 minutes')").bind(session.sub).first<{ count: number }>();
  if ((recentCount?.count || 0) >= rateLimit) return c.json({ error: "Je maximum van " + rateLimit + " aanvragen per 30 minuten is bereikt." }, 429);
  const duplicate = await c.env.DB.prepare("SELECT id FROM requests WHERE event_id = ? AND spotify_track_id = ? AND status IN ('pending','approved','queued') LIMIT 1").bind(session.eventId, trackId).first();
  if (duplicate) return c.json({ error: "Dit nummer staat al in de wachtrij." }, 409);

  try {
    const token = await getSpotifyToken(c.env);
    const trackResponse = await fetch("https://api.spotify.com/v1/tracks/" + trackId, { headers: { Authorization: "Bearer " + token } });
    if (!trackResponse.ok) return c.json({ error: "We konden dit nummer niet meer ophalen bij Spotify." }, 400);
    const track = await trackResponse.json() as SpotifyTrack;
    const requestId = crypto.randomUUID();
    const status = config.auto_approve === "true" ? "approved" : "pending";
    await c.env.DB.prepare(
      "INSERT INTO requests (id,event_id,guest_id,spotify_track_id,track_uri,track_name,artist_name,album_image_url,duration_ms,status,approved_at) VALUES (?,?,?,?,?,?,?,?,?,?,CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END)",
    ).bind(requestId, session.eventId, session.sub, track.id, track.uri, track.name, track.artists.map((artist) => artist.name).join(", "), track.album.images?.[1]?.url || track.album.images?.[0]?.url || null, track.duration_ms, status, status).run();
    return c.json({ ok: true, request: { id: requestId, name: track.name, artists: track.artists.map((artist) => artist.name), status } }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Aanvraag kon niet worden opgeslagen." }, 503);
  }
});

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export class QueueRoom {
  constructor(private readonly state: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "queue-room" });
    return new Response("Not found", { status: 404 });
  }
}
export default app;
