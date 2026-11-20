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
  AI?: { run(model: string, input: Record<string, unknown>): Promise<any> };
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
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

  const settings = await c.env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('requests_paused','max_requests_per_hour','auto_approve','auto_queue')").all<{ key: string; value: string }>();
  const config = Object.fromEntries((settings.results || []).map((row) => [row.key, row.value]));
  if (config.requests_paused === "true") return c.json({ error: "De DJ heeft aanvragen tijdelijk gepauzeerd." }, 403);

  const rateLimit = Number(config.max_requests_per_hour || 20);
  const recentCount = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM requests WHERE guest_id = ? AND requested_at >= datetime('now','-1 hour')").bind(session.sub).first<{ count: number }>();
  if ((recentCount?.count || 0) >= rateLimit) return c.json({ error: "Je maximum van " + rateLimit + " aanvragen per uur is bereikt." }, 429);
  const duplicate = await c.env.DB.prepare("SELECT id FROM requests WHERE event_id = ? AND spotify_track_id = ? AND status IN ('pending','approved','queued') LIMIT 1").bind(session.eventId, trackId).first();
  if (duplicate) return c.json({ error: "Dit nummer staat al in de wachtrij." }, 409);

  try {
    const token = await getSpotifyToken(c.env);
    const trackResponse = await fetch("https://api.spotify.com/v1/tracks/" + trackId, { headers: { Authorization: "Bearer " + token } });
    if (!trackResponse.ok) return c.json({ error: "We konden dit nummer niet meer ophalen bij Spotify." }, 400);
    const track = await trackResponse.json() as SpotifyTrack;
    const requestId = crypto.randomUUID();
    const status = config.auto_approve === "true" ? (config.auto_queue === "true" ? "queued" : "approved") : "pending";
    await c.env.DB.prepare(
      "INSERT INTO requests (id,event_id,guest_id,spotify_track_id,track_uri,track_name,artist_name,album_image_url,duration_ms,status,approved_at,queued_at) VALUES (?,?,?,?,?,?,?,?,?,?,CASE WHEN ? IN ('approved','queued') THEN CURRENT_TIMESTAMP ELSE NULL END,CASE WHEN ? = 'queued' THEN CURRENT_TIMESTAMP ELSE NULL END)",
    ).bind(requestId, session.eventId, session.sub, track.id, track.uri, track.name, track.artists.map((artist) => artist.name).join(", "), track.album.images?.[1]?.url || track.album.images?.[0]?.url || null, track.duration_ms, status, status, status).run();
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
app.post("/api/dj/ai/assistant", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  let body: { prompt?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 600) return c.json({ error: "Stel een vraag van maximaal 600 tekens." }, 400);
  const profileKey = "dj_ai_profile_" + c.env.EVENT_ID;
  const historyKey = "dj_ai_history_" + c.env.EVENT_ID;
  const explicitPreference = /\b(onthoud|vanaf nu|voortaan|mijn voorkeur|ik wil altijd|ik hou van|ik houd van|ik verkies)\b/i.test(prompt);
  let memoryUpdated = false;
  if (explicitPreference) {
    const existingProfile = await c.env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(profileKey).first<{value:string}>();
    let preferences: string[] = [];
    try { preferences = JSON.parse(existingProfile?.value || "[]"); } catch { preferences = []; }
    const preference = prompt.replace(/\s+/g," ").trim().slice(0,240);
    if (preference && !preferences.includes(preference)) {
      preferences = [...preferences, preference].slice(-20);
      await c.env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(profileKey,JSON.stringify(preferences)).run();
      memoryUpdated = true;
    }
  }
  const [rows, playedRows, countRows, orderSetting, profileSetting, historySetting] = await Promise.all([
    c.env.DB.prepare("SELECT id,track_name,artist_name,duration_ms,status,queued_at,requested_at FROM requests WHERE event_id=? AND status IN ('pending','approved','queued') ORDER BY CASE status WHEN 'queued' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, requested_at DESC LIMIT 45").bind(c.env.EVENT_ID).all<{id:string;track_name:string;artist_name:string;duration_ms:number|null;status:string;queued_at:string|null;requested_at:string}>(),
    c.env.DB.prepare("SELECT track_name,artist_name FROM requests WHERE event_id=? AND status='played' ORDER BY played_at DESC LIMIT 8").bind(c.env.EVENT_ID).all<{track_name:string;artist_name:string}>(),
    c.env.DB.prepare("SELECT status,COUNT(*) AS count FROM requests WHERE event_id=? AND status IN ('pending','approved','queued','played') GROUP BY status").bind(c.env.EVENT_ID).all<{status:string;count:number}>(),
    c.env.DB.prepare("SELECT value FROM settings WHERE key='partyqueue_order'").first<{value:string}>(),
    c.env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(profileKey).first<{value:string}>(),
    c.env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(historyKey).first<{value:string}>()
  ]);
  const tracks = rows.results || [];
  let savedOrder: string[] = [];
  try { savedOrder = JSON.parse(orderSetting?.value || "[]"); } catch { savedOrder = []; }
  const orderIndex = new Map(savedOrder.map((id,index)=>[id,index]));
  const queued = tracks.filter(t=>t.status==="queued").sort((a,b)=>(orderIndex.get(a.id)??Number.MAX_SAFE_INTEGER)-(orderIndex.get(b.id)??Number.MAX_SAFE_INTEGER)||String(a.queued_at||a.requested_at).localeCompare(String(b.queued_at||b.requested_at)));
  const recent = playedRows.results || [];
  const current = recent[0];
  const brusselsParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const localPart = (type: string) => brusselsParts.find(part => part.type === type)?.value || "";
  const localDate = localPart("year")+"-"+localPart("month")+"-"+localPart("day");
  const localHour = Number(localPart("hour"));
  const localMinute = Number(localPart("minute"));
  const isNewYearsEve = localDate === "2026-12-31";
  const isAfterMidnight = localDate === "2027-01-01" && localHour < 3;
  const roundedLocalMinute = Math.floor(localMinute/15)*15;
  const minutesToMidnight = isNewYearsEve ? Math.ceil((1440-(localHour*60+roundedLocalMinute))/15)*15 : null;
  const minutesAfterMidnight = isAfterMidnight ? Math.floor((localHour*60+roundedLocalMinute)/15)*15 : null;
  const eventMoment = {
    belgianLocalTime: localDate+" "+localPart("hour")+":"+String(roundedLocalMinute).padStart(2,"0")+" (rounded to 15 min)",
    isNewYearsEve2026: isNewYearsEve,
    minutesToMidnight,
    minutesAfterMidnight,
    phase: isAfterMidnight ? "after_midnight" : !isNewYearsEve ? "rehearsal_or_non_event_day" :
      minutesToMidnight! > 240 ? "early_evening" :
      minutesToMidnight! > 90 ? "building_toward_midnight" :
      minutesToMidnight! > 15 ? "countdown_peak_window_approaching" :
      "midnight_peak"
  };
  let djPreferences: string[] = [];
  let djHistory: Array<{at:string;tracks:string[]}> = [];
  try { djPreferences = JSON.parse(profileSetting?.value || "[]"); } catch { djPreferences = []; }
  try { djHistory = JSON.parse(historySetting?.value || "[]"); } catch { djHistory = []; }
  const context = {
    event: c.env.EVENT_NAME,
    eventMoment,
    djPreferences,
    acceptedSetHistory: djHistory.slice(-5),
    currentlyLastPlayed: current ? current.track_name+" — "+current.artist_name : "unknown",
    upNext: queued.map(t=>t.track_name+" — "+t.artist_name+" ["+Math.round((t.duration_ms||0)/60000)+" min]"),
    recentPlayed: recent.map(t=>t.track_name+" — "+t.artist_name),
    requestMix: Object.fromEntries((countRows.results||[]).map(row=>[row.status,row.count]))
  };
  const djKnowledge = "DJ KNOWLEDGE (compact rules): The DJ wants creative freedom, variety and deliberate surprises, not a perfectly uniform playlist. STYLE CHANGES ARE ALLOWED AND OFTEN DESIRABLE: you may place a disco/dance/90s/80s/rock block between ballads, jump from slow to fast, switch decade or genre sharply, or create a deliberate contrast. Never reject or discourage a requested style change just because it breaks musical flow. Treat a block of 2–6 tracks in one style/decade as a valid DJ technique. Offer smooth bridges when useful, but they are optional—not a requirement. ENERGY: shape warm-up, lift, peak, breather and singalong moments when useful; intentional drops and sudden lifts are valid. BPM/tempo: estimate only broad slow/mid/fast feel from general music knowledge; do not require adjacent tracks to have compatible tempo. Never invent exact BPM, key or beatmatching claims: no audio analysis or measured tempo data is available. DECADE + GENRE: use era and genre to create varied blocks, themed runs and surprising contrasts; do not force chronological or genre continuity. If a track's era or genre is uncertain, do not state it as fact. EVENT TIMING: use eventMoment. On 31 December 2026, shape the live set for the actual Belgian local time: early evening = warm-up; 4–1.5 hours before midnight = build; final 90 minutes = recognizable high-energy anthems and singalongs, with a strong peak around midnight; after midnight = celebratory peak, then sustain and refresh energy. Do not force a midnight countdown arc during rehearsal or on another date. For queue optimization, creatively rearrange all supplied upNext tracks; preserve every track exactly once, but prioritize the DJ's requested style, decade, energy or block over smooth transitions. Never claim measured audio properties or crowd awareness. Outside tracks may be suggested proactively when useful, clearly labelled as suggestions; never silently insert them into the queue. If the DJ names a track to add, help identify it for Spotify selection rather than refusing because it differs stylistically.";
  const system = "You are DJ#DATUUR AI, a concise Dutch-language assistant for a live party DJ. Analyse only the supplied PartyQueue metadata. Give practical, specific advice in Dutch. Never claim to hear audio, know the crowd, access Spotify audio, or control playback. Never invent queued tracks; clearly label any outside suggestion. The DJ always decides. Keep normal advice under 120 words. When the DJ asks for 20 tracks, return exactly 20 concrete numbered tracks, one per line, in the format \"1. Titel — Artiest\". Never stop early; no intro or outro around a requested track list. When asked for a complete numbered queue order, include every requested track even if that exceeds 120 words. For queue optimization, first count the supplied upNext entries and output exactly that many numbered lines. Each supplied entry must appear exactly once: never duplicate a track, never omit a track, and never add a track that is not in upNext. Before answering, verify that the output line count equals the upNext entry count and that no track is repeated.\n\n" + djKnowledge;
  const user = "PARTYQUEUE CONTEXT:\n"+JSON.stringify(context)+"\n\nDJ QUESTION:\n"+prompt;
  const provider = (c.env.AI_PROVIDER || "cloudflare").toLowerCase();
  // Reuse an identical answer for ten minutes while the queue context remains unchanged.
  // This avoids spending Workers AI Neurons on repeated DJ questions.
  const cacheKey = await sha256(provider + "\\n" + system + "\\n" + user);
  const cachedRow = await c.env.DB.prepare("SELECT value,updated_at FROM settings WHERE key='dj_ai_answer_cache'").first<{value:string;updated_at:string}>();
  if (cachedRow?.updated_at && Date.now() - Date.parse(cachedRow.updated_at + "Z") < 10 * 60 * 1000) {
    try {
      const cached = JSON.parse(cachedRow.value) as {key:string;answer:string};
      if (cached.key === cacheKey && cached.answer) return c.json({ok:true,provider,answer:cached.answer,cached:true,memoryUpdated});
    } catch { /* Ignore an invalid cache entry and generate a fresh answer. */ }
  }
  const rate = await c.env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('dj_ai_last_request','1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP WHERE settings.updated_at < datetime('now','-8 seconds')").run();
  if (!rate.meta.changes) return c.json({ error: "Geef DJ#DATUUR AI even een paar seconden." }, 429);
  try {
    let answer = "";
    if (provider === "openai") {
      if (!c.env.OPENAI_API_KEY) return c.json({ error: "OpenAI is nog niet geconfigureerd. Voeg OPENAI_API_KEY toe als Worker secret." }, 503);
      const response = await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+c.env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:c.env.OPENAI_MODEL||"gpt-6-luna",messages:[{role:"developer",content:system},{role:"user",content:user}],max_completion_tokens:850})});
      const data:any=await response.json(); if(!response.ok)throw new Error("OpenAI HTTP "+response.status+": "+JSON.stringify(data.error||{}).slice(0,220));
      answer=data.choices?.[0]?.message?.content||"Geen antwoord ontvangen.";
    } else if (provider === "anthropic") {
      if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: "Claude is nog niet geconfigureerd. Voeg ANTHROPIC_API_KEY toe als Worker secret." }, 503);
      const response = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":c.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model:c.env.ANTHROPIC_MODEL||"claude-haiku-5-5",max_tokens:850,system,messages:[{role:"user",content:user}]})});
      const data:any=await response.json(); if(!response.ok)throw new Error("Claude HTTP "+response.status+": "+JSON.stringify(data.error||{}).slice(0,220));
      answer=(data.content||[]).filter((part:any)=>part.type==="text").map((part:any)=>part.text).join("\n")||"Geen antwoord ontvangen.";
    } else {
      if (!c.env.AI) return c.json({ error: "Cloudflare Workers AI-binding ontbreekt. Voeg [ai] binding = \"AI\" toe en deploy opnieuw." }, 503);
      const result:any=await c.env.AI.run(c.env.AI_MODEL||"@cf/google/gemma-4-26b-a4b-it",{
        messages:[{role:"system",content:system},{role:"user",content:user}],
        max_tokens:1400,
        temperature:0.4,
        chat_template_kwargs:{enable_thinking:false}
      });
      answer=typeof result==="string" ? result :
        result?.response ||
        result?.result?.response ||
        result?.choices?.[0]?.message?.content ||
        result?.output_text ||
        "";
      if (Array.isArray(answer)) answer=answer.map((part:any)=>typeof part==="string"?part:part?.text||"").join("\\n");
      if (typeof answer!=="string" || !answer.trim()) {
        console.error("DJ AI returned no text", JSON.stringify({provider,keys:result&&typeof result==="object"?Object.keys(result):[],usage:result?.usage||null}));
        throw new Error("Cloudflare AI gaf geen antwoordtekst terug. Probeer het opnieuw.");
      }
    }
    const finalAnswer = String(answer).slice(0,8000);
    await c.env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('dj_ai_answer_cache',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify({key:cacheKey,answer:finalAnswer})).run();
    return c.json({ ok:true,provider,answer:finalAnswer,cached:false,memoryUpdated });
  } catch(error) {
    return c.json({ error:error instanceof Error?error.message:"AI-assistent is tijdelijk niet beschikbaar." },502);
  }
});
app.post("/api/dj/ai/music/search", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  let body: { queries?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  if (!Array.isArray(body.queries) || body.queries.length > 20 || !body.queries.every(q => typeof q === "string")) {
    return c.json({ error: "Geef maximaal 20 trackzoekopdrachten door." }, 400);
  }
  const queries = (body.queries as string[]).map(q => q.replace(/\s+/g," ").trim().slice(0,140)).filter(q => q.length > 2);
  if (!queries.length) return c.json({ error: "Ik kon geen bruikbare titels en artiesten uit de lijst halen." }, 400);
  try {
    const token = await getSpotifyToken(c.env);
    const results = await Promise.all(queries.map(async query => {
      const url = new URL("https://api.spotify.com/v1/search");
      url.searchParams.set("q", query);
      url.searchParams.set("type", "track");
      url.searchParams.set("limit", "3");
      const response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
      if (!response.ok) return { query, tracks: [] };
      const data = await response.json() as { tracks?: { items?: SpotifyTrack[] } };
      return { query, tracks: (data.tracks?.items || []).map(track => ({
        id: track.id, uri: track.uri, name: track.name, artists: track.artists.map(a => a.name),
        durationMs: track.duration_ms, albumImageUrl: track.album.images?.[1]?.url || track.album.images?.[0]?.url || null
      })) };
    }));
    return c.json({ ok: true, results });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Spotify zoeken is tijdelijk niet beschikbaar." }, 502);
  }
});
app.post("/api/dj/ai/music/add", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  let body: { trackId?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const trackId = typeof body.trackId === "string" ? body.trackId.trim() : "";
  if (!/^[A-Za-z0-9]{22}$/.test(trackId)) return c.json({ error: "Ongeldig Spotify-track-ID." }, 400);
  try {
    const duplicate = await c.env.DB.prepare("SELECT id,status FROM requests WHERE event_id=? AND spotify_track_id=? AND status IN ('pending','approved','queued') LIMIT 1").bind(c.env.EVENT_ID,trackId).first<{id:string;status:string}>();
    if (duplicate) return c.json({ ok:true,alreadyQueued:true,status:duplicate.status });
    const token = await getSpotifyToken(c.env);
    const response = await fetch("https://api.spotify.com/v1/tracks/"+trackId,{headers:{Authorization:"Bearer "+token}});
    if (!response.ok) return c.json({error:"Spotify kon dit nummer niet meer ophalen."},502);
    const track = await response.json() as SpotifyTrack;
    const djGuestId = "dj-music-director-"+c.env.EVENT_ID;
    await c.env.DB.prepare("INSERT OR IGNORE INTO guests (id,event_id,nickname) VALUES (?,?,?)").bind(djGuestId,c.env.EVENT_ID,"DJ#DATUUR AI").run();
    const requestId = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO requests (id,event_id,guest_id,spotify_track_id,track_uri,track_name,artist_name,album_image_url,duration_ms,status,approved_at,queued_at) VALUES (?,?,?,?,?,?,?,?,?,'queued',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)")
      .bind(requestId,c.env.EVENT_ID,djGuestId,track.id,track.uri,track.name,track.artists.map(a=>a.name).join(", "),track.album.images?.[1]?.url||track.album.images?.[0]?.url||null,track.duration_ms).run();
    const saved = await c.env.DB.prepare("SELECT value FROM settings WHERE key='partyqueue_order'").first<{value:string}>();
    let order: string[] = [];
    try { order = JSON.parse(saved?.value||"[]"); } catch { order=[]; }
    order = order.filter(id=>id!==requestId);
    order.push(requestId);
    await c.env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('partyqueue_order',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(order)).run();
    return c.json({ok:true,request:{id:requestId,name:track.name,artist:track.artists.map(a=>a.name).join(", "),status:"queued"}},201);
  } catch(error) {
    return c.json({error:error instanceof Error?error.message:"Track toevoegen aan de wachtrij is mislukt."},502);
  }
});
app.get("/api/dj/overview", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  const [activeRequests, recentPlayed, settings] = await Promise.all([
    c.env.DB.prepare("SELECT r.id, r.spotify_track_id, r.track_uri, r.track_name, r.artist_name, r.album_image_url, r.duration_ms, r.status, r.moderation_reason, r.requested_at, r.queued_at, g.nickname FROM requests r JOIN guests g ON g.id = r.guest_id WHERE r.event_id = ? AND r.status IN ('pending','approved','queued') ORDER BY r.requested_at ASC").bind(c.env.EVENT_ID).all(),
    c.env.DB.prepare("SELECT r.id, r.spotify_track_id, r.track_uri, r.track_name, r.artist_name, r.album_image_url, r.duration_ms, r.status, r.moderation_reason, r.requested_at, r.queued_at, g.nickname FROM requests r JOIN guests g ON g.id = r.guest_id WHERE r.event_id = ? AND r.status = 'played' ORDER BY r.played_at DESC LIMIT 100").bind(c.env.EVENT_ID).all(),
    c.env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('requests_paused','auto_approve','auto_queue','partyqueue_order')").all<{key:string;value:string}>()
  ]);
  const config = Object.fromEntries((settings.results || []).map(x => [x.key, x.value]));
  let savedOrder: string[] = [];
  try { savedOrder = JSON.parse(config.partyqueue_order || "[]"); } catch { savedOrder = []; }
  const orderIndex = new Map(savedOrder.map((id, index) => [id, index]));
  const rows = [...(activeRequests.results || []), ...(recentPlayed.results || [])] as Array<Record<string, any>>;
  rows.sort((a,b) => {
    const rank = (status: string) => status === "pending" ? 0 : status === "approved" ? 1 : status === "queued" ? 2 : status === "played" ? 3 : 4;
    const statusDiff = rank(a.status) - rank(b.status);
    if (statusDiff) return statusDiff;
    if (a.status === "queued") return (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER) || String(a.queued_at || a.requested_at).localeCompare(String(b.queued_at || b.requested_at));
    return String(a.requested_at).localeCompare(String(b.requested_at));
  });
  const queuedIds = rows.filter(r => r.status === "queued").map(r => r.id);
  const normalizedOrder = [...savedOrder.filter(id => queuedIds.includes(id)), ...queuedIds.filter(id => !savedOrder.includes(id))];
  return c.json({ requests: rows, queueOrder: normalizedOrder, settings: { requestsPaused: config.requests_paused === "true", autoApprove: config.auto_approve === "true", autoQueue: config.auto_queue === "true" } });
});
app.post("/api/dj/queue/reorder", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  let body: { order?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  if (!Array.isArray(body.order) || body.order.length > 100 || !body.order.every(id => typeof id === "string")) return c.json({ error: "Ongeldige wachtrijvolgorde." }, 400);
  const current = await c.env.DB.prepare("SELECT id FROM requests WHERE event_id=? AND status='queued'").bind(c.env.EVENT_ID).all<{id:string}>();
  const currentIds = (current.results || []).map(row => row.id);
  const requested = body.order as string[];
  if (new Set(requested).size !== requested.length || requested.length !== currentIds.length || currentIds.some(id => !requested.includes(id))) return c.json({ error: "De wachtrij is intussen gewijzigd. Vernieuw de lijst en probeer opnieuw." }, 409);
  const orderedTracks = await c.env.DB.prepare("SELECT id,track_name,artist_name FROM requests WHERE event_id=? AND status='queued'").bind(c.env.EVENT_ID).all<{id:string;track_name:string;artist_name:string}>();
  const trackById = new Map((orderedTracks.results || []).map(track => [track.id,track]));
  const acceptedTracks = requested.map(id => trackById.get(id)).filter(Boolean).map(track => track!.track_name+" — "+track!.artist_name);
  await c.env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('partyqueue_order',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(requested)).run();
  const historyKey = "dj_ai_history_" + c.env.EVENT_ID;
  const previousHistory = await c.env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(historyKey).first<{value:string}>();
  let history: Array<{at:string;tracks:string[]}> = [];
  try { history = JSON.parse(previousHistory?.value || "[]"); } catch { history = []; }
  history.push({at:new Date().toISOString(),tracks:acceptedTracks});
  history = history.slice(-5);
  await c.env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(historyKey,JSON.stringify(history)).run();
  return c.json({ ok: true, order: requested });
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
  const autoQueue = action === "approve" && (await c.env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind("auto_queue").first<{value:string}>())?.value === "true";
  if (!transition || !transition.from.includes(current.status)) return c.json({ error: "Deze actie kan niet op deze aanvraag worden uitgevoerd." }, 409);
  const nextStatus = autoQueue ? "queued" : transition.to;
  const timestamp = action === "played" ? "played_at" : action === "queue" || autoQueue ? "queued_at" : action === "approve" ? "approved_at" : null;
  const sql = timestamp ? "UPDATE requests SET status = ?, " + timestamp + " = CURRENT_TIMESTAMP WHERE id = ? AND event_id = ?" : "UPDATE requests SET status = ? WHERE id = ? AND event_id = ?";
  await c.env.DB.prepare(sql).bind(nextStatus, id, c.env.EVENT_ID).run();
  return c.json({ ok: true, status: nextStatus });
});
app.post("/api/dj/settings/:key", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  const key = c.req.param("key");
  if (!["requests_paused","auto_approve","auto_queue"].includes(key)) return c.json({ error: "Onbekende instelling." }, 400);
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
  // Serialize refresh-token rotation across concurrent Worker requests.
  const owner = crypto.randomUUID();
  for (let attempt = 0; attempt < 16; attempt++) {
    const row = await env.DB.prepare("SELECT access_token_enc,refresh_token_enc,expires_at FROM spotify_auth WHERE id='main'").first<{access_token_enc:string;refresh_token_enc:string;expires_at:number}>();
    if (!row) throw new Error("Koppel eerst je Spotify-account via de DJ-console.");
    if (row.expires_at > Date.now()+60000) return unseal(row.access_token_enc,env.SESSION_SECRET);
    const claim = await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_token_refresh_lock',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP WHERE settings.updated_at < datetime('now','-30 seconds')").bind(owner).run();
    if (!claim.meta.changes) {
      await new Promise(resolve => setTimeout(resolve,200));
      continue;
    }
    try {
      // Another request may have refreshed while this request was waiting to acquire the lock.
      const latest = await env.DB.prepare("SELECT access_token_enc,refresh_token_enc,expires_at FROM spotify_auth WHERE id='main'").first<{access_token_enc:string;refresh_token_enc:string;expires_at:number}>();
      if (!latest) throw new Error("Spotify-koppeling ontbreekt.");
      if (latest.expires_at > Date.now()+60000) return await unseal(latest.access_token_enc,env.SESSION_SECRET);
      const refreshToken = await unseal(latest.refresh_token_enc,env.SESSION_SECRET);
      const basic = btoa(env.SPOTIFY_CLIENT_ID+":"+env.SPOTIFY_CLIENT_SECRET);
      const response = await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{Authorization:"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refreshToken})});
      if (!response.ok) {
        const detail = (await response.text()).slice(0,300);
        throw new Error("Spotify-token vernieuwen mislukt (HTTP "+response.status+"). "+detail);
      }
      const data = await response.json() as {access_token:string;expires_in:number;refresh_token?:string};
      await saveSpotifyTokens(env,data.access_token,data.refresh_token||refreshToken,data.expires_in);
      return data.access_token;
    } finally {
      await env.DB.prepare("DELETE FROM settings WHERE key='spotify_token_refresh_lock' AND value=?").bind(owner).run();
    }
  }
  throw new Error("Spotify-token wordt momenteel door een andere aanvraag vernieuwd. Probeer zo opnieuw.");
}
async function spotifyFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  let token = await spotifyUserToken(env);
  let response = await fetch("https://api.spotify.com/v1"+path,{...init,headers:{...(init.headers||{}),Authorization:"Bearer "+token}});
  if (response.status === 401) {
    // The cached token may have been revoked or rotated by another concurrent request.
    await env.DB.prepare("UPDATE spotify_auth SET expires_at=0 WHERE id='main'").run();
    token = await spotifyUserToken(env);
    response = await fetch("https://api.spotify.com/v1"+path,{...init,headers:{...(init.headers||{}),Authorization:"Bearer "+token}});
  }
  return response;
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
const SPOTIFY_FALLBACK_PLAYLIST_URI = "spotify:playlist:37i9dQZF1DXa2PvUpywmrr";

async function startSpotifyFallback(env: Env): Promise<void> {
  const shuffle = await spotifyFetch(env, "/me/player/shuffle?state=true", { method: "PUT" });
  if (!shuffle.ok && shuffle.status !== 204) throw new Error("Spotify shuffle inschakelen mislukt (HTTP " + shuffle.status + ").");
  const play = await spotifyFetch(env, "/me/player/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context_uri: SPOTIFY_FALLBACK_PLAYLIST_URI })
  });
  if (!play.ok && play.status !== 204) throw new Error("Spotify Party Hits starten mislukt (HTTP " + play.status + ").");
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_active','true',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true',updated_at=CURRENT_TIMESTAMP").run();
}

async function startNextPartyQueueRequest(env: Env): Promise<{ok:boolean;busy?:boolean;track?:{name:string;artist:string};requestId?:string;error?:string}> {
  // A unique lock owner prevents overlapping auto/manual NEXT and prevents an old request deleting a newer lock.
  const owner = crypto.randomUUID();
  const lock = await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_partyqueue_next_lock',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP WHERE settings.updated_at < datetime('now','-30 seconds')").bind(owner).run();
  if (!lock.meta.changes) return {ok:false,busy:true,error:"Een andere NEXT-actie wordt al verwerkt."};
  try {
    const queued = await env.DB.prepare("SELECT id,track_uri,track_name,artist_name,duration_ms,queued_at,requested_at FROM requests WHERE event_id=? AND status='queued' ORDER BY queued_at ASC,requested_at ASC")
      .bind(env.EVENT_ID).all<{id:string;track_uri:string;track_name:string;artist_name:string;duration_ms:number;queued_at:string;requested_at:string}>();
    const saved = await env.DB.prepare("SELECT value FROM settings WHERE key='partyqueue_order'").first<{value:string}>();
    let order: string[] = [];
    try { order = JSON.parse(saved?.value || "[]"); } catch { order = []; }
    const orderIndex = new Map(order.map((id,index) => [id,index]));
    const candidates = queued.results || [];
    candidates.sort((a,b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER) || String(a.queued_at || a.requested_at).localeCompare(String(b.queued_at || b.requested_at)));
    const next = candidates[0];
    if (!next) return {ok:false,error:"Er staan geen PartyQueue-aanvragen klaar."};
    const response = await spotifyFetch(env,"/me/player/play",{
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({uris:[next.track_uri]})
    });
    if (!response.ok) throw new Error("Spotify kon het volgende nummer niet starten (HTTP "+response.status+").");
    const updated = await env.DB.prepare("UPDATE requests SET status='played',played_at=CURRENT_TIMESTAMP WHERE id=? AND event_id=? AND status='queued'")
      .bind(next.id,env.EVENT_ID).run();
    if (!updated.meta.changes) throw new Error("De aanvraag is intussen gewijzigd; probeer opnieuw.");
    await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_active','false',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='false',updated_at=CURRENT_TIMESTAMP").run();
    await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_last_partyqueue_track',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP")
      .bind(JSON.stringify({uri:next.track_uri,durationMs:next.duration_ms,startedAt:Date.now()})).run();
    return {ok:true,track:{name:next.track_name,artist:next.artist_name},requestId:next.id};
  } catch (error) {
    return {ok:false,error:error instanceof Error?error.message:"Volgende PartyQueue-aanvraag starten is mislukt."};
  } finally {
    await env.DB.prepare("DELETE FROM settings WHERE key='spotify_partyqueue_next_lock' AND value=?").bind(owner).run();
  }
}

async function maybeAdvancePartyQueue(env: Env, playing: boolean): Promise<{advanced:boolean;error?:string}> {
  if (playing) return {advanced:false};
  const manualPause = await env.DB.prepare("SELECT value FROM settings WHERE key='spotify_manual_pause'").first<{value:string}>();
  if (manualPause?.value === "true") return {advanced:false};
  const lastState = await env.DB.prepare("SELECT value FROM settings WHERE key='spotify_last_partyqueue_track'").first<{value:string}>();
  if (!lastState?.value) return {advanced:false};
  let last: {uri:string;durationMs:number;startedAt:number};
  try { last=JSON.parse(lastState.value); } catch { return {advanced:false}; }
  if (!last.uri || !last.durationMs || !last.startedAt) return {advanced:false};
  // Wait until the expected end of the last PartyQueue track; tolerate Spotify's end-of-track reporting delay.
  if (Date.now()-last.startedAt < Math.max(0,last.durationMs-2500)) return {advanced:false};
  const queued = await env.DB.prepare("SELECT COUNT(*) AS count FROM requests WHERE event_id=? AND status='queued'").bind(env.EVENT_ID).first<{count:number}>();
  if (!(queued?.count||0)) return {advanced:false};
  const result=await startNextPartyQueueRequest(env);
  if(result.ok)return {advanced:true};
  // A simultaneous manual/automatic NEXT is expected contention, not an autoplay failure.
  if(result.busy)return {advanced:false};
  return {advanced:false,error:result.error};
}

async function maybeStartSpotifyFallback(env: Env, currentTrackUri: string | null, playing: boolean, progressMs: number, currentDurationMs: number): Promise<boolean> {
  const manualPause = await env.DB.prepare("SELECT value FROM settings WHERE key='spotify_manual_pause'").first<{value:string}>();
  if (manualPause?.value === "true") return false;
  const state = await env.DB.prepare("SELECT value,updated_at FROM settings WHERE key='spotify_fallback_active'").first<{value:string;updated_at:string}>();
  if (state?.value === "true") return true;
  if (state?.value === "starting" && Date.now() - Date.parse(state.updated_at + "Z") < 60000) return false;
  const retry = await env.DB.prepare("SELECT value FROM settings WHERE key='spotify_fallback_retry_after'").first<{value:string}>();
  if (Number(retry?.value || 0) > Date.now()) return false;
  const queued = await env.DB.prepare("SELECT COUNT(*) AS count FROM requests WHERE event_id=? AND status='queued'").bind(env.EVENT_ID).first<{count:number}>();
  if ((queued?.count || 0) > 0) return false;
  const lastState = await env.DB.prepare("SELECT value FROM settings WHERE key='spotify_last_partyqueue_track'").first<{value:string}>();
  if (!lastState?.value) return false;
  let last: { uri: string; durationMs: number; startedAt: number };
  try { last = JSON.parse(lastState.value); } catch { return false; }
  if (!last.uri || !last.durationMs || !last.startedAt) return false;
  const elapsed = Date.now() - last.startedAt;
  if (elapsed < Math.max(0, last.durationMs - 4000)) return false;
  // The PartyQueue track must have had enough time to finish.
  // Spotify can keep the last track metadata after it ends and reset progress_ms to 0.
  // Once the expected duration has elapsed, only an actively playing copy should block fallback.
  if (currentTrackUri === last.uri && playing) return false;
  const claim = await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_active','starting',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='starting',updated_at=CURRENT_TIMESTAMP WHERE settings.value NOT IN ('true','starting') OR settings.updated_at < datetime('now','-1 minute')").run();
  if (!claim.meta.changes) return false;
  try {
    await startSpotifyFallback(env);
    await env.DB.prepare("DELETE FROM settings WHERE key='spotify_fallback_retry_after'").run();
    await env.DB.prepare("DELETE FROM settings WHERE key='spotify_fallback_error'").run();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Spotify-fout";
    await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_error',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(message).run();
    await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_active','false',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='false',updated_at=CURRENT_TIMESTAMP").run();
    await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_retry_after',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP")
      .bind(String(Date.now() + 60000)).run();
    return false;
  }
}

app.get("/api/dj/spotify/status",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env)) return c.json({error:"DJ-sessie verlopen."},401);
  try{
    const response=await spotifyFetch(c.env,"/me/player");
    if(response.status===204){
      const fallbackActive=await maybeStartSpotifyFallback(c.env,null,false,0,0);
      const autoAdvance=await maybeAdvancePartyQueue(c.env,false);
      const fallbackError=await c.env.DB.prepare("SELECT value FROM settings WHERE key='spotify_fallback_error'").first<{value:string}>();
      return c.json({connected:true,playing:false,device:null,track:null,nextTrack:null,fallbackActive,autoAdvanced:autoAdvance.advanced,autoAdvanceError:autoAdvance.error||null,fallbackError:fallbackError?.value||null});
    }
    if(!response.ok) return c.json({error:"Spotify playbackstatus niet beschikbaar (HTTP "+response.status+")."},502);
    const data=await response.json() as any;
    const item=data.item;
    const playing=!!data.is_playing;
    // If playback was resumed directly in Spotify, clear a stale pause flag left by the DJ console.
    if(playing){
      await c.env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_manual_pause','false',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='false',updated_at=CURRENT_TIMESTAMP").run();
    }
    const autoAdvance=await maybeAdvancePartyQueue(c.env,playing);
    const fallbackActive=await maybeStartSpotifyFallback(c.env,item?.uri||null,playing,data.progress_ms||0,item?.duration_ms||0);
    const fallbackError=await c.env.DB.prepare("SELECT value FROM settings WHERE key='spotify_fallback_error'").first<{value:string}>();
    let nextTrack=null;
    if(fallbackActive){
      const queueResponse=await spotifyFetch(c.env,"/me/player/queue");
      if(queueResponse.ok){
        const queueData=await queueResponse.json() as any;
        const upcoming=queueData.queue?.[0];
        if(upcoming) nextTrack={id:upcoming.id,uri:upcoming.uri,name:upcoming.name,artists:(upcoming.artists||[]).map((a:any)=>a.name),image:upcoming.album?.images?.[0]?.url||null,durationMs:upcoming.duration_ms};
      }
    }
    return c.json({connected:true,playing,progressMs:data.progress_ms||0,fallbackActive,autoAdvanced:autoAdvance.advanced,autoAdvanceError:autoAdvance.error||null,nextTrack,fallbackError:fallbackError?.value||null,device:data.device?{id:data.device.id,name:data.device.name,type:data.device.type,active:data.device.is_active,volume:data.device.volume_percent}:null,track:item?{id:item.id,uri:item.uri,name:item.name,artists:(item.artists||[]).map((a:any)=>a.name),image:item.album?.images?.[0]?.url||null,durationMs:item.duration_ms}:null});
  }catch(e){return c.json({connected:false,error:e instanceof Error?e.message:"Spotify niet verbonden."},503);}
});
app.get("/api/dj/spotify/devices",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env)) return c.json({error:"DJ-sessie verlopen."},401);
  try{const r=await spotifyFetch(c.env,"/me/player/devices");if(!r.ok)return c.json({error:"Spotify-apparaten ophalen mislukt (HTTP "+r.status+")."},502);return c.json(await r.json());}
  catch(e){return c.json({error:e instanceof Error?e.message:"Spotify niet beschikbaar."},503);}
});
app.post("/api/dj/spotify/next-request",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env))return c.json({error:"DJ-sessie verlopen."},401);
  const result=await startNextPartyQueueRequest(c.env);
  if(result.busy)return c.json({ok:false,busy:true,error:result.error||"Een andere NEXT-actie wordt al verwerkt."});
  if(!result.ok)return c.json({error:result.error||"Volgende aanvraag starten is mislukt."},409);
  return c.json({ok:true,track:result.track,requestId:result.requestId});
});
app.put("/api/dj/spotify/volume",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env)) return c.json({error:"DJ-sessie verlopen."},401);
  let body:{volume?:unknown};
  try{body=await c.req.json();}catch{return c.json({error:"Ongeldige aanvraag."},400);}
  if(typeof body.volume!=="number"||!Number.isInteger(body.volume)||body.volume<0||body.volume>100)return c.json({error:"Volume moet een geheel getal tussen 0 en 100 zijn."},400);
  try{
    const response=await spotifyFetch(c.env,"/me/player/volume?volume_percent="+body.volume,{method:"PUT"});
    if(!response.ok&&response.status!==204)return c.json({error:"Spotify kon het volume niet aanpassen (HTTP "+response.status+"). Controleer of een actief Spotify-apparaat beschikbaar is."},502);
    return c.json({ok:true,volume:body.volume});
  }catch(error){return c.json({error:error instanceof Error?error.message:"Spotify-volume aanpassen is mislukt."},503);}
});
app.post("/api/dj/spotify/:action",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env)) return c.json({error:"DJ-sessie verlopen."},401);
  const action=c.req.param("action");
  const paths:Record<string,{method:string;path:string}>={play:{method:"PUT",path:"/me/player/play"},pause:{method:"PUT",path:"/me/player/pause"},next:{method:"POST",path:"/me/player/next"},previous:{method:"POST",path:"/me/player/previous"}};
  const command=paths[action];if(!command)return c.json({error:"Onbekend Spotify-commando."},400);
  try{
    const r=await spotifyFetch(c.env,command.path,{method:command.method});
    if(!r.ok&&r.status!==204){
      const detail=(await r.text()).slice(0,400);
      return c.json({error:"Spotify-commando geweigerd (HTTP "+r.status+"). "+detail},502);
    }
    if(action==="pause") await c.env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_manual_pause','true',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true',updated_at=CURRENT_TIMESTAMP").run();
    if(action==="play") await c.env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_manual_pause','false',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='false',updated_at=CURRENT_TIMESTAMP").run();
    return c.json({ok:true});
  }
  catch(e){return c.json({error:e instanceof Error?e.message:"Spotify-commando mislukt."},503);}
});
app.post("/api/dj/spotify/queue/:id",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env))return c.json({error:"DJ-sessie verlopen."},401);
  const id=c.req.param("id");
  const row=await c.env.DB.prepare("SELECT status FROM requests WHERE id=? AND event_id=?").bind(id,c.env.EVENT_ID).first<{status:string}>();
  if(!row||row.status!=="approved")return c.json({error:"Alleen goedgekeurde nummers kunnen naar de PartyQueue-wachtrij."},409);
  await c.env.DB.prepare("UPDATE requests SET status='queued',queued_at=CURRENT_TIMESTAMP WHERE id=? AND event_id=?").bind(id,c.env.EVENT_ID).run();
  return c.json({ok:true,status:"queued"});
});

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

async function cleanupOldRequests(env: Env): Promise<void> {
  // Keep the live queue untouched; only purge completed requests older than 30 days.
  await env.DB.prepare(
    "DELETE FROM requests WHERE requested_at < datetime('now','-30 days') AND status NOT IN ('pending','approved','queued')"
  ).run();
}

export class QueueRoom {
  constructor(private readonly state: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "queue-room" });
    return new Response("Not found", { status: 404 });
  }
}
export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanupOldRequests(env));
  }
};
