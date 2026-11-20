import { Hono } from "hono";
import type { Env } from "./platform/env";
import { constantTimeEqual, sha256, toBase64Url } from "./platform/security/crypto";
import { createSessionToken, readSession, type Session } from "./modules/identity/session-token";
import { getSpotifyTrack, searchSpotifyTracks } from "./integrations/spotify/catalog-api";
import type { SpotifyTrack } from "./integrations/spotify/types";
import { exchangeSpotifyAuthorizationCode, spotifyFetch } from "./integrations/spotify/user-auth-service";
import { executeDJAssistant } from "./modules/ai/application/execute-dj-assistant";
import { dispatchNextTrack } from "./modules/queue/application/dispatch-next-track";
import { maybeAdvancePartyQueue as runQueueAdvancement, maybeStartSpotifyFallback as runSpotifyFallbackPolicy } from "./modules/playback/application/playback-automation";
import { getCurrentPlayback, getPlaybackDevices, getPlaybackQueue, playPlaylist, playTrack, sendPlaybackCommand, setPlaybackShuffle, setPlaybackVolume } from "./integrations/spotify/playback-api";
import { addDjTrackToPartyQueue, joinPartyGuest, moderatePartyRequest, queueApprovedPartyRequest, submitGuestTrackRequest } from "./modules/requests/application/guest-request-lifecycle";










const app = new Hono<{ Bindings: Env }>();

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
  const result = await joinPartyGuest({
    db: c.env.DB, eventId: c.env.EVENT_ID,
    nickname: typeof body.nickname === "string" ? body.nickname.trim() : "",
    eventCode: typeof body.eventCode === "string" ? body.eventCode.trim() : "",
    expectedCodeHash: c.env.EVENT_ACCESS_CODE_HASH, sessionSecret: c.env.SESSION_SECRET,
    hashCode: sha256, createToken: createSessionToken, createId: () => crypto.randomUUID(),
    nowSeconds: () => Math.floor(Date.now() / 1000),
  });
  return c.json(result.body, result.status as 200);
});

app.get("/api/spotify/search", async (c) => {
  const session = await readSession(c.req.raw, c.env.SESSION_SECRET);
  if (!session || session.eventId !== c.env.EVENT_ID) return c.json({ error: "Je sessie is verlopen. Meld je opnieuw aan." }, 401);
  const query = (c.req.query("q") || "").trim();
  if (query.length < 2 || query.length > 100) return c.json({ error: "Zoek op minstens 2 en maximaal 100 tekens." }, 400);
  try {
    const response = await searchSpotifyTracks(c.env, query, 8);
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
  const result = await submitGuestTrackRequest({
    db: c.env.DB, eventId: session.eventId, guestId: session.sub, trackId,
    createId: () => crypto.randomUUID(), getSpotifyTrack: (id) => getSpotifyTrack(c.env, id),
  });
  return c.json(result.body, result.status as 200);
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
  const token = await createSessionToken({ sub: "dj", eventId: c.env.EVENT_ID, nickname: "DJ", role: "dj", exp: expiresAt }, c.env.SESSION_SECRET);
  return c.json({ ok: true, token, expiresAt });
});
app.post("/api/dj/ai/assistant", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  let body: { prompt?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 600) return c.json({ error: "Stel een vraag van maximaal 600 tekens." }, 400);

  const result = await executeDJAssistant(c.env, prompt);
  return c.json(result.body, result.status as 200 | 429 | 503 | 502);
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
    const results = await Promise.all(queries.map(async query => {
      const response = await searchSpotifyTracks(c.env, query, 3);
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
  const result = await addDjTrackToPartyQueue({
    db: c.env.DB,eventId: c.env.EVENT_ID,trackId,createId:()=>crypto.randomUUID(),
    getSpotifyTrack:(id)=>getSpotifyTrack(c.env,id),
  });
  return c.json(result.body,result.status as 200);
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
  const result = await moderatePartyRequest({
    db:c.env.DB,eventId:c.env.EVENT_ID,requestId:c.req.param("id"),action:c.req.param("action"),
  });
  return c.json(result.body,result.status as 200);
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
  const response=await exchangeSpotifyAuthorizationCode(c.env,code,redirectUri);
  if(!response.ok) return new Response("Spotify-tokenuitwisseling mislukt (HTTP "+response.status+").",{status:502});
  return new Response(null,{status:302,headers:{Location:"/dj.html?spotify=connected","Set-Cookie":clearCookie}});
});
const SPOTIFY_FALLBACK_PLAYLIST_URI = "spotify:playlist:37i9dQZF1DXa2PvUpywmrr";

async function startSpotifyFallback(env: Env): Promise<void> {
  const shuffle = await setPlaybackShuffle(spotifyFetch.bind(null, env), true);
  if (!shuffle.ok && shuffle.status !== 204) throw new Error("Spotify shuffle inschakelen mislukt (HTTP " + shuffle.status + ").");
  const play = await playPlaylist(spotifyFetch.bind(null, env), SPOTIFY_FALLBACK_PLAYLIST_URI);
  if (!play.ok && play.status !== 204) throw new Error("Spotify Party Hits starten mislukt (HTTP " + play.status + ").");
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spotify_fallback_active','true',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true',updated_at=CURRENT_TIMESTAMP").run();
}

async function startNextPartyQueueRequest(env: Env): Promise<{ok:boolean;busy?:boolean;track?:{name:string;artist:string};requestId?:string;error?:string}> {
  return dispatchNextTrack({
    db: env.DB,
    eventId: env.EVENT_ID,
    playTrack: async (trackUri) => {
      const response = await playTrack(spotifyFetch.bind(null, env), trackUri);
      return { ok: response.ok, status: response.status };
    },
  });
}

async function maybeAdvancePartyQueue(env: Env, playing: boolean): Promise<{advanced:boolean;error?:string}> {
  return runQueueAdvancement({
    db: env.DB,
    eventId: env.EVENT_ID,
    dispatchNext: async () => {
      const result = await startNextPartyQueueRequest(env);
      return { ok: result.ok, busy: result.busy, error: result.error };
    },
  }, playing);
}

async function maybeStartSpotifyFallback(env: Env, currentTrackUri: string | null, playing: boolean, _progressMs: number, _currentDurationMs: number): Promise<boolean> {
  return runSpotifyFallbackPolicy({
    db: env.DB,
    eventId: env.EVENT_ID,
    startFallback: () => startSpotifyFallback(env),
  }, currentTrackUri, playing);
}

app.get("/api/dj/spotify/status",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env)) return c.json({error:"DJ-sessie verlopen."},401);
  try{
    const response=await getCurrentPlayback(spotifyFetch.bind(null, c.env));
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
      const queueResponse=await getPlaybackQueue(spotifyFetch.bind(null, c.env));
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
  try{const r=await getPlaybackDevices(spotifyFetch.bind(null, c.env));if(!r.ok)return c.json({error:"Spotify-apparaten ophalen mislukt (HTTP "+r.status+")."},502);return c.json(await r.json());}
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
    const response=await setPlaybackVolume(spotifyFetch.bind(null, c.env),body.volume);
    if(!response.ok&&response.status!==204)return c.json({error:"Spotify kon het volume niet aanpassen (HTTP "+response.status+"). Controleer of een actief Spotify-apparaat beschikbaar is."},502);
    return c.json({ok:true,volume:body.volume});
  }catch(error){return c.json({error:error instanceof Error?error.message:"Spotify-volume aanpassen is mislukt."},503);}
});
app.post("/api/dj/spotify/:action",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env)) return c.json({error:"DJ-sessie verlopen."},401);
  const action=c.req.param("action");
  const allowedActions = ["play","pause","next","previous"] as const;
  if (!(allowedActions as readonly string[]).includes(action)) return c.json({error:"Onbekend Spotify-commando."},400);
  try{
    const r=await sendPlaybackCommand(spotifyFetch.bind(null, c.env),action as "play"|"pause"|"next"|"previous");
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
  const result=await queueApprovedPartyRequest({db:c.env.DB,eventId:c.env.EVENT_ID,requestId:c.req.param("id")});
  return c.json(result.body,result.status as 200);
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
