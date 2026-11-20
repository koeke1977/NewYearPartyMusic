import { Hono } from "hono";
import type { Env } from "../platform/env";
import { spotifyFetch } from "../integrations/spotify/user-auth-service";
import { getCurrentPlayback, getPlaybackDevices, getPlaybackQueue, sendPlaybackCommand, setPlaybackVolume } from "../integrations/spotify/playback-api";
import { getDjSpotifyPlaybackStatus } from "../modules/playback/application/get-dj-spotify-playback-status";
import { executeDjSpotifyCommand, listDjSpotifyDevices, setDjSpotifyVolume } from "../modules/playback/application/dj-playback-controls";
import { readSpotifyFallbackError, setSpotifyManualPause } from "../modules/playback/infrastructure/playback-policy-repository";
import { queueApprovedPartyRequest } from "../modules/requests/application/guest-request-lifecycle";
import { maybeAdvancePartyQueue, maybeStartSpotifyFallback, startNextPartyQueueRequest } from "../platform/composition/dj-playback-workflows";
import { requireDJSession } from "./dj-auth";
import { createGuestRequestRepository } from "../modules/requests/infrastructure/guest-request-d1-repository";
export const djPlaybackRoutes = new Hono<{ Bindings: Env }>();
djPlaybackRoutes.use("/api/dj/*", requireDJSession());
djPlaybackRoutes.get("/api/dj/spotify/status", async (c) => {
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
djPlaybackRoutes.get("/api/dj/spotify/devices", async (c) => {
  const result = await listDjSpotifyDevices({
    getDevices: () => getPlaybackDevices(spotifyFetch.bind(null, c.env)),
  });
  return c.json(result.body, result.status);
});
djPlaybackRoutes.post("/api/dj/spotify/next-request",async(c)=>{
  const result=await startNextPartyQueueRequest(c.env);
  if(result.busy)return c.json({ok:false,busy:true,error:result.error||"Een andere NEXT-actie wordt al verwerkt."});
  if(!result.ok)return c.json({error:result.error||"Volgende aanvraag starten is mislukt."},409);
  return c.json({ok:true,track:result.track,requestId:result.requestId});
});
djPlaybackRoutes.put("/api/dj/spotify/volume", async (c) => {
  let body: { volume?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const result = await setDjSpotifyVolume({
    volume: body.volume,
    setVolume: (volume) => setPlaybackVolume(spotifyFetch.bind(null, c.env), volume),
  });
  return c.json(result.body, result.status);
});
djPlaybackRoutes.post("/api/dj/spotify/:action", async (c) => {
  const result = await executeDjSpotifyCommand({
    action: c.req.param("action"),
    sendCommand: (action) => sendPlaybackCommand(spotifyFetch.bind(null, c.env), action),
    setManualPause: (paused) => setSpotifyManualPause(c.env.DB, paused),
  });
  return c.json(result.body, result.status);
});
djPlaybackRoutes.post("/api/dj/spotify/queue/:id",async(c)=>{
  const result=await queueApprovedPartyRequest({db:c.env.DB,eventId:c.env.EVENT_ID,requestId:c.req.param("id")});
  return c.json(result.body,result.status as 200);
});

