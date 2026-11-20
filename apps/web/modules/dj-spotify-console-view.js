import { formatTrackTime, getTrackProgress, getTrackProgressStatus } from "./dj-playback-display.js";
import { normalizeSpotifyVolume, getSpotifyPlaybackControls, getSpotifyPlaybackSummary } from "./dj-playback-state.js";

// DOM-only view for the DJ Spotify console. It never performs network or playback actions.
export function createDjSpotifyConsoleView({ documentRef = document } = {}) {
  function setDeck(side, track) {
    const title=documentRef.querySelector("#booth-track-title-"+side);
    const artist=documentRef.querySelector("#booth-track-artist-"+side);
    const image=documentRef.querySelector("#booth-track-image-"+side);
    const placeholder=documentRef.querySelector("#booth-track-placeholder-"+side);
    const link=documentRef.querySelector("#booth-track-link-"+side);
    if(title)title.textContent=track?.name||(side==="left"?"Waiting for Spotify":"SPOTIFY MIX");
    if(artist)artist.textContent=track?.artists?.join(", ")||track?.artist||(side==="left"?"Spotify deck":"Party Hits · SHUFFLE");
    const trackId=track?.id||track?.spotify_track_id||track?.uri?.split(":").pop();
    if(link){
      if(trackId){link.href="https://open.spotify.com/track/"+encodeURIComponent(trackId);link.hidden=false;}
      else{link.removeAttribute("href");link.hidden=true;}
    }
    if(!image)return;
    if(track?.image||track?.album_image_url){
      image.src=track.image||track.album_image_url;image.hidden=false;if(placeholder)placeholder.hidden=true;
    }else{
      image.removeAttribute("src");image.hidden=true;if(placeholder)placeholder.hidden=false;
    }
  }
  function updateMasterVolumeDisplay(value) {
    const volume=normalizeSpotifyVolume(value);
    const slider=documentRef.querySelector("#master-volume");
    const label=documentRef.querySelector("#master-volume-value");
    const leds=documentRef.querySelector("#master-volume-leds");
    if(slider)slider.value=String(volume);
    if(label)label.textContent=volume+"%";
    if(leds){
      const active=Math.round(volume/5);leds.replaceChildren();
      for(let i=0;i<20;i++){const led=documentRef.createElement("i");if(i<active)led.className=i>=16?"hot":i>=12?"high":"active";leds.append(led);}
      leds.setAttribute("aria-valuenow",String(volume));
    }
  }
  function updateTrackProgress(progressMs,durationMs,playing) {
    const {duration,progress,percent}=getTrackProgress(progressMs,durationMs);
    const leds=documentRef.querySelector("#track-progress-leds");
    const value=documentRef.querySelector("#track-progress-value");
    const elapsed=documentRef.querySelector("#track-progress-elapsed");
    const total=documentRef.querySelector("#track-progress-duration");
    const status=documentRef.querySelector("#track-progress-status");
    if(value)value.textContent=duration?percent+"%":"—%";
    if(elapsed)elapsed.textContent=formatTrackTime(progress);
    if(total)total.textContent=formatTrackTime(duration);
    if(status)status.textContent=getTrackProgressStatus(duration,playing);
    if(leds){
      const active=Math.round(percent/5);leds.replaceChildren();
      for(let i=0;i<20;i++){const led=documentRef.createElement("i");if(i<active)led.className=i>=16?"hot":i>=12?"high":"active";leds.append(led);}
      leds.setAttribute("aria-valuenow",String(percent));
    }
  }
  function syncPlaybackButtons(connected,playing) {
    const state=getSpotifyPlaybackControls(connected,playing);
    const play=documentRef.querySelector('[data-spotify-command="play"]');
    const pause=documentRef.querySelector('[data-spotify-command="pause"]');
    [[play,state.playSelected],[pause,state.pauseSelected]].forEach(([button,active])=>{
      if(!button)return;button.classList.toggle("is-selected",active);button.classList.toggle("is-idle",!active);button.setAttribute("aria-pressed",String(active));
    });
    const booth=documentRef.querySelector("#partyqueue-booth");
    if(booth){booth.classList.toggle("is-playing",state.boothPlaying);const status=documentRef.querySelector("#booth-play-state");if(status)status.textContent=state.boothStatus;}
  }
  function renderStatus(data,onQueuePreview=()=>{}) {
    const summary=getSpotifyPlaybackSummary(data);
    const state=documentRef.querySelector("#spotify-connection-state");
    const device=documentRef.querySelector("#spotify-device");
    const now=documentRef.querySelector("#spotify-now-playing");
    const nowLink=documentRef.querySelector("#spotify-now-playing-link");
    const booth=documentRef.querySelector("#partyqueue-booth");
    if(state){state.textContent=summary.connection;state.classList.toggle("accent",!!data.connected);}
    documentRef.querySelector("#spotify-connect")?.classList.toggle("is-connected",!!data.connected);
    syncPlaybackButtons(!!data.connected,!!data.playing);
    if(booth){
      booth.classList.toggle("is-playing",!!data.playing);
      const boothState=documentRef.querySelector("#booth-play-state");
      if(boothState)boothState.textContent=data.fallbackActive?"SPOTIFY MIX":data.playing?"ON AIR":"STANDBY";
      setDeck("left",data.track?{id:data.track.id,name:data.track.name,artists:data.track.artists,image:data.track.image}:null);
      if(nowLink){
        if(data.track?.id){nowLink.href="https://open.spotify.com/track/"+encodeURIComponent(data.track.id);nowLink.hidden=false;}
        else{nowLink.removeAttribute("href");nowLink.hidden=true;}
      }
      const nextTrack=data.fallbackActive?data.nextTrack:null;
      onQueuePreview(nextTrack);
      const nextButton=documentRef.querySelector("#partyqueue-next");
      if(nextButton?.disabled)setDeck("right",nextTrack);
      updateTrackProgress(data.progressMs,data.track?.durationMs,data.playing);
    }
    if(data.fallbackActive){const boothState=documentRef.querySelector("#booth-play-state");if(boothState)boothState.textContent="SPOTIFY MIX";}
    if(device)device.textContent=summary.device;
    const volumeStatus=documentRef.querySelector("#master-volume-status");
    if(summary.volume!==null){updateMasterVolumeDisplay(summary.volume);if(volumeStatus)volumeStatus.textContent="SPOTIFY MASTER OUTPUT";}
    else if(volumeStatus)volumeStatus.textContent="NO ACTIVE SPOTIFY DEVICE";
    if(now)now.textContent=summary.nowPlaying;
  }
  function renderOffline(error) {
    const state=documentRef.querySelector("#spotify-connection-state");
    const device=documentRef.querySelector("#spotify-device");
    const now=documentRef.querySelector("#spotify-now-playing");
    const nowLink=documentRef.querySelector("#spotify-now-playing-link");
    if(state){state.textContent="NOT CONNECTED";state.classList.remove("accent");}
    documentRef.querySelector("#spotify-connect")?.classList.remove("is-connected");
    syncPlaybackButtons(false,false);
    const booth=documentRef.querySelector("#partyqueue-booth");
    if(booth){booth.classList.remove("is-playing");const boothState=documentRef.querySelector("#booth-play-state");if(boothState)boothState.textContent="OFFLINE";setDeck("left",null);updateTrackProgress(0,0,false);}
    if(nowLink){nowLink.removeAttribute("href");nowLink.hidden=true;}
    if(device)device.textContent=error.message;
    if(now)now.textContent="Connect your Spotify account to enable live playback.";
  }
  return { setDeck, updateMasterVolumeDisplay, updateTrackProgress, syncPlaybackButtons, renderStatus, renderOffline };
}
