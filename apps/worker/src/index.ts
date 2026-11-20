import { Hono } from "hono";
import type { Env } from "./platform/env";
import { constantTimeEqual, sha256, toBase64Url } from "./platform/security/crypto";
import { createSessionToken, readSession } from "./modules/identity/session-token";
import { loginDj, readDjSession } from "./modules/identity/dj-session";
import { getSpotifyTrack, searchSpotifyTracks } from "./integrations/spotify/catalog-api";
import type { SpotifyTrack } from "./integrations/spotify/types";
import { exchangeSpotifyAuthorizationCode, spotifyFetch } from "./integrations/spotify/user-auth-service";
import { executeDJAssistant } from "./modules/ai/application/execute-dj-assistant";
import { dispatchNextTrack } from "./modules/queue/application/dispatch-next-track";
import { maybeAdvancePartyQueue as runQueueAdvancement, maybeStartSpotifyFallback as runSpotifyFallbackPolicy } from "./modules/playback/application/playback-automation";
import { getCurrentPlayback, getPlaybackQueue, playPlaylist, playTrack, setPlaybackShuffle } from "./integrations/spotify/playback-api";
import { addDjTrackToPartyQueue, joinPartyGuest, moderatePartyRequest, queueApprovedPartyRequest, submitGuestTrackRequest } from "./modules/requests/application/guest-request-lifecycle";
import { getDjOverview, reorderDjQueue, updateDjSetting } from "./modules/requests/application/dj-queue-management";
import { cleanupCompletedRequests } from "./modules/requests/application/cleanup-completed-requests";
import { readSpotifyFallbackError, setSpotifyFallbackActive, setSpotifyManualPause } from "./modules/playback/infrastructure/playback-policy-repository";
import { getDjSpotifyPlaybackStatus } from "./modules/playback/application/get-dj-spotify-playback-status";
import { executeDjSpotifyCommand, listDjSpotifyDevices, setDjSpotifyVolume } from "./modules/playback/application/dj-playback-controls";










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


async function requireDJ(request: Request, env: Env): Promise<boolean> {
  return !!(await readDjSession(request, env.SESSION_SECRET, env.EVENT_ID));
}
app.post("/api/dj/login", async (c) => {
  let body: { code?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const result = await loginDj({
    code: typeof body.code === "string" ? body.code.trim() : "",
    expectedCodeHash: c.env.DJ_ACCESS_CODE_HASH,
    sessionSecret: c.env.SESSION_SECRET,
    eventId: c.env.EVENT_ID,
    hashCode: sha256,
    createToken: createSessionToken,
    nowSeconds: () => Math.floor(Date.now() / 1000),
  });
  return c.json(result.body, result.status as 200 | 401 | 503);
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
  return c.json(await getDjOverview({ db: c.env.DB, eventId: c.env.EVENT_ID }));
});
app.post("/api/dj/queue/reorder", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen. Meld opnieuw aan." }, 401);
  let body: { order?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const result = await reorderDjQueue({ db: c.env.DB, eventId: c.env.EVENT_ID, order: body.order });
  return c.json(result.body, result.status as 200 | 400 | 409);
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
  let body: { enabled?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const result = await updateDjSetting({ db: c.env.DB, key: c.req.param("key"), enabled: body.enabled });
  return c.json(result.body, result.status as 200 | 400);
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
  await setSpotifyFallbackActive(env.DB);
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

app.get("/api/dj/spotify/status", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen." }, 401);
  const spotify = spotifyFetch.bind(null, c.env);
  const result = await getDjSpotifyPlaybackStatus({
    getCurrentPlayback: () => getCurrentPlayback(spotify),
    getPlaybackQueue: () => getPlaybackQueue(spotify),
    maybeAdvance: (playing) => maybeAdvancePartyQueue(c.env, playing),
    maybeStartFallback: (trackUri, playing, progressMs, durationMs) =>
      maybeStartSpotifyFallback(c.env, trackUri, playing, progressMs, durationMs),
    readFallbackError: () => readSpotifyFallbackError(c.env.DB),
    clearManualPause: () => setSpotifyManualPause(c.env.DB, false),
  });
  return c.json(result.body, result.status);
});
app.get("/api/dj/spotify/devices", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen." }, 401);
  const result = await listDjSpotifyDevices({
    getDevices: () => getPlaybackDevices(spotifyFetch.bind(null, c.env)),
  });
  return c.json(result.body, result.status);
});
app.post("/api/dj/spotify/next-request",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env))return c.json({error:"DJ-sessie verlopen."},401);
  const result=await startNextPartyQueueRequest(c.env);
  if(result.busy)return c.json({ok:false,busy:true,error:result.error||"Een andere NEXT-actie wordt al verwerkt."});
  if(!result.ok)return c.json({error:result.error||"Volgende aanvraag starten is mislukt."},409);
  return c.json({ok:true,track:result.track,requestId:result.requestId});
});
app.put("/api/dj/spotify/volume", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen." }, 401);
  let body: { volume?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const result = await setDjSpotifyVolume({
    volume: body.volume,
    setVolume: (volume) => setPlaybackVolume(spotifyFetch.bind(null, c.env), volume),
  });
  return c.json(result.body, result.status);
});
app.post("/api/dj/spotify/:action", async (c) => {
  if (!await requireDJ(c.req.raw, c.env)) return c.json({ error: "DJ-sessie verlopen." }, 401);
  const result = await executeDjSpotifyCommand({
    action: c.req.param("action"),
    sendCommand: (action) => sendPlaybackCommand(spotifyFetch.bind(null, c.env), action),
    setManualPause: (paused) => setSpotifyManualPause(c.env.DB, paused),
  });
  return c.json(result.body, result.status);
});
app.post("/api/dj/spotify/queue/:id",async(c)=>{
  if(!await requireDJ(c.req.raw,c.env))return c.json({error:"DJ-sessie verlopen."},401);
  const result=await queueApprovedPartyRequest({db:c.env.DB,eventId:c.env.EVENT_ID,requestId:c.req.param("id")});
  return c.json(result.body,result.status as 200);
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
export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanupCompletedRequests(env.DB));
  }
};
