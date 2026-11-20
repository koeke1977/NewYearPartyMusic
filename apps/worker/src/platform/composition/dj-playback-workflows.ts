import type { Env } from "../env";
import { spotifyFetch } from "../../integrations/spotify/user-auth-service";
import { playPlaylist, playTrack, setPlaybackShuffle } from "../../integrations/spotify/playback-api";
import { dispatchNextTrack } from "../../modules/queue/application/dispatch-next-track";
import { createQueueDispatchRepository } from "../../modules/queue/infrastructure/queue-dispatch-d1-repository";
import { maybeAdvancePartyQueue as runQueueAdvancement, maybeStartSpotifyFallback as runSpotifyFallbackPolicy } from "../../modules/playback/application/playback-automation";
import { setSpotifyFallbackActive } from "../../modules/playback/infrastructure/playback-policy-repository";
const SPOTIFY_FALLBACK_PLAYLIST_URI = "spotify:playlist:37i9dQZF1DXa2PvUpywmrr";
async function startSpotifyFallback(env: Env): Promise<void> {
 const shuffle=await setPlaybackShuffle(spotifyFetch.bind(null,env),true);
 if(!shuffle.ok&&shuffle.status!==204)throw new Error("Spotify shuffle inschakelen mislukt (HTTP "+shuffle.status+").");
 const play=await playPlaylist(spotifyFetch.bind(null,env),SPOTIFY_FALLBACK_PLAYLIST_URI);
 if(!play.ok&&play.status!==204)throw new Error("Spotify Party Hits starten mislukt (HTTP "+play.status+").");
 await setSpotifyFallbackActive(env.DB);
}
export async function startNextPartyQueueRequest(env: Env): Promise<{ok:boolean;busy?:boolean;track?:{name:string;artist:string};requestId?:string;error?:string}> {
 return dispatchNextTrack({repository:createQueueDispatchRepository(env.DB),eventId:env.EVENT_ID,playTrack:async(trackUri)=>{const response=await playTrack(spotifyFetch.bind(null,env),trackUri);return {ok:response.ok,status:response.status};}});
}
export async function maybeAdvancePartyQueue(env: Env,playing:boolean):Promise<{advanced:boolean;error?:string}>{
 return runQueueAdvancement({db:env.DB,eventId:env.EVENT_ID,dispatchNext:async()=>{const result=await startNextPartyQueueRequest(env);return {ok:result.ok,busy:result.busy,error:result.error};}},playing);
}
export async function maybeStartSpotifyFallback(env:Env,currentTrackUri:string|null,playing:boolean,_progressMs:number,_currentDurationMs:number):Promise<boolean>{
 return runSpotifyFallbackPolicy({db:env.DB,eventId:env.EVENT_ID,startFallback:()=>startSpotifyFallback(env)},currentTrackUri,playing);
}
