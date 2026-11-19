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
  DJ_ACCESS_CODE_HASH: string;
  SESSION_SECRET: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
}

type Session = { sub: string; eventId: string; nickname: string; exp: number; role?: string };
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
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
async function readSession(request: Request, secret: string): Promise<Session | null> {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !secret) return null;
  try {
    const expected = await signSession(payload, secret);
    if (!constantTimeEqual(signature, expected)) return null;
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


async function requireDJ(request: Request, env: Env): Promise<Session | null> {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session || session.role !== "dj" || session.eventId !== env.EVENT_ID) return null;
  return session;
}
app.post("/api/dj/login", async (c) => {
  if (!c.env.DJ_ACCESS_CODE_HASH) return c.json({ error: "DJ-toegang is nog niet geconfigureerd." }, 503);
  let body: { code?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code || code.length > 64 || (await sha256(code)) !== c.env.DJ_ACCESS_CODE_HASH.trim().toLowerCase()) return c.json({ error: "Onjuiste DJ-code." }, 401);
  const expiresAt = Math.floor(Date.now() / 1000) + 28800;
  const payload = toBase64Url(encoder.encode(JSON.stringify({ sub: "dj", eventId: c.env.EVENT_ID, nickname: "DJ", role: "dj", exp: expiresAt })));
  const token = payload + "." + await signSession(payload, c.env.SESSION_SECRET);
  return c.json({ ok: true, token, expiresAt });
});
app.get("/api/dj/overview", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  const [requests, settings] = await Promise.all([
    c.env.DB.prepare("SELECT r.id, r.spotify_track_id, r.track_uri, r.track_name, r.artist_name, r.album_image_url, r.duration_ms, r.status, r.moderation_reason, r.requested_at, g.nickname FROM requests r JOIN guests g ON g.id = r.guest_id WHERE r.event_id = ? ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'queued' THEN 2 WHEN 'played' THEN 3 ELSE 4 END, r.requested_at ASC LIMIT 100").bind(c.env.EVENT_ID).all(),
    c.env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('requests_paused','auto_approve')").all<{key:string;value:string}>()
  ]);
  const config = Object.fromEntries((settings.results || []).map(x => [x.key, x.value]));
  return c.json({ requests: requests.results || [], settings: { requestsPaused: config.requests_paused === "true", autoApprove: config.auto_approve === "true" } });
});
app.post("/api/dj/requests/:id/:action", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  const id = c.req.param("id");
  const action = c.req.param("action");
  const current = await c.env.DB.prepare("SELECT id, status FROM requests WHERE id = ? AND event_id = ?").bind(id, c.env.EVENT_ID).first<{id:string;status:string}>();
  if (!current) return c.json({ error: "Aanvraag niet gevonden." }, 404);
  const transitions: Record<string, {from:string[];to:string}> = {
    approve: {from:["pending"],to:"approved"}, reject: {from:["pending","approved","queued"],to:"rejected"},
    played: {from:["approved","queued"],to:"played"}, queue: {from:["approved"],to:"queued"}
  };
  const transition = transitions[action];
  if (!transition || !transition.from.includes(current.status)) return c.json({ error: "Deze actie kan niet op deze aanvraag worden uitgevoerd." }, 409);
  const timestamp = action === "played" ? "played_at" : action === "queue" ? "queued_at" : action === "approve" ? "approved_at" : null;
  const sql = timestamp ? "UPDATE requests SET status = ?, " + timestamp + " = CURRENT_TIMESTAMP WHERE id = ? AND event_id = ?" : "UPDATE requests SET status = ? WHERE id = ? AND event_id = ?";
  await c.env.DB.prepare(sql).bind(transition.to, id, c.env.EVENT_ID).run();
  return c.json({ ok: true, status: transition.to });
});
app.post("/api/dj/settings/:key", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  const key = c.req.param("key");
  if (!["requests_paused","auto_approve"].includes(key)) return c.json({ error: "Onbekende instelling." }, 400);
  let body: { enabled?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  if (typeof body.enabled !== "boolean") return c.json({ error: "Ongeldige waarde." }, 400);
  await c.env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP").bind(key, String(body.enabled)).run();
  return c.json({ ok: true, enabled: body.enabled });
});

async function tokenKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:"AES-GCM",iv}, await tokenKey(secret), encoder.encode(value));
  return toBase64Url(new Uint8Array([...iv, ...new Uint8Array(encrypted)]));
}
async function unseal(value: string, secret: string): Promise<string> {
  const bytes = fromBase64Url(value); const iv = bytes.slice(0,12); const data = bytes.slice(12);
  const decrypted = await crypto.subtle.decrypt({name:"AES-GCM",iv}, await tokenKey(secret), data);
  return new TextDecoder().decode(decrypted);
}
async function saveSpotifyTokens(env: Env, accessToken: string, refreshToken: string, expiresIn: number) {
  const [accessEnc, refreshEnc] = await Promise.all([seal(accessToken,env.SESSION_SECRET),seal(refreshToken,env.SESSION_SECRET)]);
  await env.DB.prepare("INSERT INTO spotify_auth (id,access_token_enc,refresh_token_enc,expires_at,updated_at) VALUES ('main',?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET access_token_enc=excluded.access_token_enc,refresh_token_enc=excluded.refresh_token_enc,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP")
    .bind(accessEnc,refreshEnc,Date.now()+expiresIn*1000).run();
}
async function spotifyUserToken(env: Env): Promise<string> {
  const row = await env.DB.prepare("SELECT access_token_enc,refresh_token_enc,expires_at FROM spotify_auth WHERE id='main'").first<{access_token_enc:string;refresh_token_enc:string;expires_at:number}>();
  if (!row) throw new Error("Koppel eerst je Spotify-account via de DJ-console.");
  if (row.expires_at > Date.now()+60000) return unseal(row.access_token_enc,env.SESSION_SECRET);
  const refreshToken = await unseal(row.refresh_token_enc,env.SESSION_SECRET);
  const basic = btoa(env.SPOTIFY_CLIENT_ID+":"+env.SPOTIFY_CLIENT_SECRET);
  const response = await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{Authorization:"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refreshToken})});
  if (!response.ok) throw new Error("Spotify-sessie verlopen. Koppel Spotify opnieuw (HTTP "+response.status+").");
  const data = await response.json() as {access_token:string;expires_in:number;refresh_token?:string};
  const nextRefresh = data.refresh_token || refreshToken;
  await saveSpotifyTokens(env,data.access_token,nextRefresh,data.expires_in);
  return data.access_token;
}
async function spotifyFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await spotifyUserToken(env);
  return fetch("https://api.spotify.com/v1"+path,{...init,headers:{...(init.headers||{}),Authorization:"Bearer "+token}});
}
app.post("/api/dj/spotify/connect", async (c) => {
  if (!await requireDJ(c.req.raw,c.env)) return c.json({error:"DJ-sessie verlopen."},401);
  const state=toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const redirectUri=c.env.PUBLIC_ORIGIN.replace(/\/$/,"")+"/auth/spotify/callback";
  const url=new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id",c.env.SPOTIFY_CLIENT_ID);
  url.searchParams.set("response_type","code");
  url.searchParams.set("redirect_uri",redirectUri);
  url.searchParams.set("scope","user-read-playback-state user-read-currently-playing user-modify-playback-state");
  url.searchParams.set("state",state);
  return c.json({url:url.toString()},{headers:{"Set-Cookie":"pq_spotify_state="+state+"; HttpOnly; Secure; SameSite=Lax; Path=/auth/spotify/callback; Max-Age=600"}});
});
app.get("/auth/spotify/callback", async (c) => {
  const state=c.req.query("state")||"", code=c.req.query("code")||"", error=c.req.query("error");
  const cookie=c.req.header("Cookie")||"";
  const expected=cookie.match(/(?:^|; )pq_spotify_state=([^;]+)/)?.[1]||"";
  if (!state || !expected || !constantTimeEqual(state,expected)) return c.text("Spotify-koppeling geweigerd: ongeldige OAuth-state.",400);
  const clearCookie="pq_spotify_state=; HttpOnly; Secure; SameSite=Lax; Path=/auth/spotify/callback; Max-Age=0";
  if (error || !code) return new Response(null,{status:302,headers:{Location:"/dj.html?spotify=denied","Set-Cookie":clearCookie}});
  const redirectUri=c.env.PUBLIC_ORIGIN.replace(/\/$/,"")+"/auth/spotify/callback";
  const response=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{Authorization:"Basic "+btoa(c.env.SPOTIFY_CLIENT_ID+":"+c.env.SPOTIFY_CLIENT_SECRET),"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:redirectUri})});
  if(!response.ok) return new Response("Spotify-tokenuitwisseling mislukt (HTTP "+response.status+").",{status:502});
  const data=await response.json() as {access_token:string;refresh_token:string;expires_in:number};
  await saveSpotifyTokens(c.env,data.access_token,data.refresh_token,data.expires_in);
  return new Response(null,{status:302,headers:{Location:"/dj.html?spotify=connected","Set-Cookie":clearCookie}});
});
app.get("/api/dj/spotify/status",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env)) return c.json({error:"DJ-sessie verlopen."},401);
  try{
    const response=await spotifyFetch(c.env,"/me/player");
    if(response.status===204) return c.json({connected:true,playing:false,device:null,track:null});
    if(!response.ok) return c.json({error:"Spotify playbackstatus niet beschikbaar (HTTP "+response.status+")."},502);
    const data=await response.json() as any;
    const item=data.item;
    return c.json({connected:true,playing:!!data.is_playing,progressMs:data.progress_ms||0,device:data.device?{id:data.device.id,name:data.device.name,type:data.device.type,active:data.device.is_active,volume:data.device.volume_percent}:null,track:item?{id:item.id,uri:item.uri,name:item.name,artists:(item.artists||[]).map((a:any)=>a.name),image:item.album?.images?.[0]?.url||null,durationMs:item.duration_ms}:null});
  }catch(e){return c.json({connected:false,error:e instanceof Error?e.message:"Spotify niet verbonden."},503);}
});
app.get("/api/dj/spotify/devices",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env)) return c.json({error:"DJ-sessie verlopen."},401);
  try{const r=await spotifyFetch(c.env,"/me/player/devices");if(!r.ok)return c.json({error:"Spotify-apparaten ophalen mislukt (HTTP "+r.status+")."},502);return c.json(await r.json());}
  catch(e){return c.json({error:e instanceof Error?e.message:"Spotify niet beschikbaar."},503);}
});
app.post("/api/dj/spotify/next-request",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env))return c.json({error:"DJ-sessie verlopen."},401);
  const next=await c.env.DB.prepare("SELECT id,track_uri,track_name,artist_name FROM requests WHERE event_id=? AND status='queued' ORDER BY queued_at ASC,requested_at ASC LIMIT 1")
    .bind(c.env.EVENT_ID).first<{id:string;track_uri:string;track_name:string;artist_name:string}>();
  if(!next)return c.json({error:"Er staan geen PartyQueue-aanvragen klaar. Cue eerst een goedgekeurd nummer naar de wachtrij."},404);
  try{
    const response=await spotifyFetch(c.env,"/me/player/play",{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({uris:[next.track_uri]})
    });
    if(!response.ok)return c.json({error:"Spotify kon de volgende PartyQueue-aanvraag niet starten (HTTP "+response.status+"). Controleer of Spotify actief speelt op je apparaat."},502);
    await c.env.DB.prepare("UPDATE requests SET status='played',played_at=CURRENT_TIMESTAMP WHERE id=? AND event_id=? AND status='queued'")
      .bind(next.id,c.env.EVENT_ID).run();
    return c.json({ok:true,track:{name:next.track_name,artist:next.artist_name},requestId:next.id});
  }catch(error){
    return c.json({error:error instanceof Error?error.message:"Volgende PartyQueue-aanvraag starten is mislukt."},503);
  }
});
app.post("/api/dj/spotify/:action",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env)) return c.json({error:"DJ-sessie verlopen."},401);
  const action=c.req.param("action");
  const paths:Record<string,{method:string;path:string}>={play:{method:"PUT",path:"/me/player/play"},pause:{method:"PUT",path:"/me/player/pause"},next:{method:"POST",path:"/me/player/next"},previous:{method:"POST",path:"/me/player/previous"}};
  const command=paths[action];if(!command)return c.json({error:"Onbekend Spotify-commando."},400);
  try{const r=await spotifyFetch(c.env,command.path,{method:command.method});if(!r.ok&&r.status!==204)return c.json({error:"Spotify-commando geweigerd (HTTP "+r.status+"). Controleer of een Spotify Connect-apparaat actief is."},502);return c.json({ok:true});}
  catch(e){return c.json({error:e instanceof Error?e.message:"Spotify-commando mislukt."},503);}
});
app.post("/api/dj/spotify/queue/:id",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env))return c.json({error:"DJ-sessie verlopen."},401);
  const row=await c.env.DB.prepare("SELECT track_uri,status FROM requests WHERE id=? AND event_id=?").bind(c.req.param("id"),c.env.EVENT_ID).first<{track_uri:string;status:string}>();
  if(!row||row.status!=="approved")return c.json({error:"Alleen goedgekeurde nummers kunnen naar Spotify."},409);
  try{const r=await spotifyFetch(c.env,"/me/player/queue?uri="+encodeURIComponent(row.track_uri),{method:"POST"});if(!r.ok)return c.json({error:"Spotify kon het nummer niet toevoegen (HTTP "+r.status+"). Zorg dat Spotify Premium speelt op een actief apparaat."},502);
    await c.env.DB.prepare("UPDATE requests SET status='queued',queued_at=CURRENT_TIMESTAMP WHERE id=?").bind(c.req.param("id")).run();return c.json({ok:true,status:"queued"});
  }catch(e){return c.json({error:e instanceof Error?e.message:"Toevoegen aan Spotify-wachtrij mislukt."},503);}
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
