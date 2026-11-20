import { createDjApi } from "./modules/dj-api.js";
import { clearDjToken, getSavedDjToken, saveDjToken } from "./modules/dj-session.js";
import { element as el } from "./modules/dom.js";
import { orderedQueued } from "./modules/dj-queue.js";
import { matchDjQueueProposal } from "./modules/dj-ai-queue-parser.js";
import { createDjPollingController } from "./modules/dj-polling.js";
import { extractDjTrackSuggestions } from "./modules/dj-ai-suggestions.js";
import { formatTrackTime, getTrackProgress, getTrackProgressStatus } from "./modules/dj-playback-display.js";
import { createLatestTaskQueue } from "./modules/dj-latest-task-queue.js";
import { normalizeSpotifyVolume, getSpotifyPlaybackControls, getSpotifyPlaybackSummary } from "./modules/dj-playback-state.js";
import { createDjPlaybackCoordinator } from "./modules/dj-playback-coordinator.js";

const loginCard=document.querySelector("#dj-login-card");
const loginForm=document.querySelector("#dj-login-form");
const loginMessage=document.querySelector("#dj-login-message");
const consoleView=document.querySelector("#dj-console");
const requestList=document.querySelector("#dj-requests");
const message=document.querySelector("#dj-message");
let token=getSavedDjToken();
let currentSettings={requestsPaused:false,autoApprove:true,autoQueue:false};
let spotifyQueuePreview=null;
let queueDragId=null;
let queueReorderBusy=false;
let latestDJOverview=null;
const api=createDjApi(()=>token);
const playback=createDjPlaybackCoordinator({
  getToken:()=>token,
  sendCommand:action=>api("/api/dj/spotify/"+action,{method:"POST"}),
  refreshStatus:()=>refreshSpotify(),
  onCommandSuccess:action=>{
    if(action==="play")syncPlaybackButtons(true,true);
    if(action==="pause")syncPlaybackButtons(true,false);
    message.textContent="Spotify command sent.";
  },
  onCommandError:error=>{message.textContent=error.message;},
});
const volumeWrites=createLatestTaskQueue(async(value,{isCurrent})=>{
  const status=document.querySelector("#master-volume-status");
  try{
    await api("/api/dj/spotify/volume",{method:"PUT",body:JSON.stringify({volume:value})});
    if(!isCurrent())return;
    status.textContent="SPOTIFY MASTER OUTPUT";
    updateMasterVolumeDisplay(value);
  }catch(e){
    if(!isCurrent())return;
    status.textContent=e.message;
    await refreshSpotify();
  }
});
const polling=createDjPollingController(refresh,refreshSpotify);
function setLoggedIn(on){
  loginCard.hidden=on;consoleView.hidden=!on;
  if(on)polling.start();
  else { polling.stop(); playback.invalidate(); volumeWrites.invalidate(); }
}
function stat(label,value,icon){const box=el("div","dj-stat");box.append(el("span","dj-stat-icon",icon));const copy=el("div","dj-stat-copy");copy.append(el("span","dj-muted",label),el("strong","",String(value)));box.append(copy);return box;}
function formatMusicTime(ms){
  const minutes=Math.max(0,Math.round((Number(ms)||0)/60000));
  const hours=Math.floor(minutes/60);
  const rest=minutes%60;
  return hours?hours+"u "+String(rest).padStart(2,"0")+"m":minutes+"m";
}
function addCover(parent,url,cls){if(!url)return;const img=el("img",cls);img.src=url;img.alt="Album artwork";img.loading="lazy";parent.append(img);}
function trackLine(r,index){
  const row=el("div","queue-track");row.append(el("span","queue-position",String(index+1).padStart(2,"0")));addCover(row,r.album_image_url,"");
  const info=el("div","queue-track-info");info.append(el("strong","",r.track_name),el("span","",r.artist_name));row.append(info,row.appendChild(el("span","queue-state","QUEUED")));return row;
}
function renderDeck(requests,queueOrder){
  const queued=orderedQueued(requests,queueOrder);
  const list=document.querySelector("#up-next");
  if(!list)return;
  list.replaceChildren();
  const upcoming=queued.slice(0,10);
  const total=document.querySelector("#queue-total");
  if(total)total.textContent=queued.length+" TRACKS";
  if(!upcoming.length){list.append(el("p","dj-empty","The queue is waiting for its first track."));return;}
  upcoming.forEach((r,i)=>list.append(trackLine(r,i)));
}

function setBoothDeck(side,track){
  const title=document.querySelector("#booth-track-title-"+side);
  const artist=document.querySelector("#booth-track-artist-"+side);
  const image=document.querySelector("#booth-track-image-"+side);
  const placeholder=document.querySelector("#booth-track-placeholder-"+side);
  if(title)title.textContent=track?.name|| (side==="left"?"Waiting for Spotify":"SPOTIFY MIX");
  if(artist)artist.textContent=track?.artists?.join(", ")||track?.artist|| (side==="left"?"Spotify deck":"Party Hits · SHUFFLE");
  if(image){
    if(track?.image||track?.album_image_url){
      image.src=track.image||track.album_image_url;
      image.hidden=false;
      if(placeholder)placeholder.hidden=true;
    }else{
      image.removeAttribute("src");image.hidden=true;
      if(placeholder)placeholder.hidden=false;
    }
  }
}
function updateMasterVolumeDisplay(value){
  const volume=normalizeSpotifyVolume(value);
  const slider=document.querySelector("#master-volume");
  const label=document.querySelector("#master-volume-value");
  const leds=document.querySelector("#master-volume-leds");
  if(slider)slider.value=String(volume);
  if(label)label.textContent=volume+"%";
  if(leds){
    const active=Math.round(volume/5);
    leds.replaceChildren();
    for(let i=0;i<20;i++){
      const led=document.createElement("i");
      if(i<active)led.className=i>=16?"hot":i>=12?"high":"active";
      leds.append(led);
    }
    leds.setAttribute("aria-valuenow",String(volume));
  }
}
function updateTrackProgress(progressMs,durationMs,playing){
  const { duration, progress, percent } = getTrackProgress(progressMs,durationMs);
  const leds=document.querySelector("#track-progress-leds");
  const value=document.querySelector("#track-progress-value");
  const elapsed=document.querySelector("#track-progress-elapsed");
  const total=document.querySelector("#track-progress-duration");
  const status=document.querySelector("#track-progress-status");
  if(value)value.textContent=duration?percent+"%":"—%";
  if(elapsed)elapsed.textContent=formatTrackTime(progress);
  if(total)total.textContent=formatTrackTime(duration);
  if(status)status.textContent=getTrackProgressStatus(duration,playing);
  if(leds){
    const active=Math.round(percent/5);
    leds.replaceChildren();
    for(let i=0;i<20;i++){
      const led=document.createElement("i");
      if(i<active)led.className=i>=16?"hot":i>=12?"high":"active";
      leds.append(led);
    }
    leds.setAttribute("aria-valuenow",String(percent));
  }
}
function syncPlaybackButtons(connected,playing){
  const state=getSpotifyPlaybackControls(connected,playing);
  const play=document.querySelector('[data-spotify-command="play"]');
  const pause=document.querySelector('[data-spotify-command="pause"]');
  [[play,state.playSelected],[pause,state.pauseSelected]].forEach(([button,active])=>{
    if(!button)return;
    button.classList.toggle("is-selected",active);
    button.classList.toggle("is-idle",!active);
    button.setAttribute("aria-pressed",String(active));
  });
  const booth=document.querySelector("#partyqueue-booth");
  if(booth){
    booth.classList.toggle("is-playing",state.boothPlaying);
    const status=document.querySelector("#booth-play-state");
    if(status)status.textContent=state.boothStatus;
  }
}
function render(data){
  latestDJOverview=data;
  currentSettings=data.settings||currentSettings;
  document.querySelector("#pause-state").textContent=currentSettings.requestsPaused?"PAUSED":"ACCEPTING";
  document.querySelector("#approval-state").textContent=currentSettings.autoApprove?"AUTO-APPROVE":"DJ APPROVAL";
  const autoQueueState=document.querySelector("#auto-queue-state");if(autoQueueState)autoQueueState.textContent=currentSettings.autoQueue?"ON":"OFF";
  const requestButton=document.querySelector("#pause-toggle");
  const approvalButton=document.querySelector("#approval-toggle");
  const queueButton=document.querySelector("#auto-queue-toggle");
  [[requestButton,!currentSettings.requestsPaused],[approvalButton,currentSettings.autoApprove],[queueButton,currentSettings.autoQueue]].forEach(([button,on])=>{
    if(!button)return;
    button.classList.toggle("is-active",on);
    button.classList.toggle("is-inactive",!on);
    button.setAttribute("aria-pressed",String(on));
  });
  document.querySelector("#pause-state").textContent=currentSettings.requestsPaused?"PAUSED":"ACCEPTING";
  document.querySelector("#approval-state").textContent=currentSettings.autoApprove?"AUTO":"DJ";

  const requests=data.requests||[];
  const count=(s)=>requests.filter(r=>r.status===s).length;
  const activeStatuses=["pending","approved","queued"];
  const musicRequested=requests.filter(r=>[...activeStatuses,"played"].includes(r.status)).reduce((sum,r)=>sum+(Number(r.duration_ms)||0),0);
  const musicRemaining=requests.filter(r=>activeStatuses.includes(r.status)).reduce((sum,r)=>sum+(Number(r.duration_ms)||0),0);
  const stats=document.querySelector("#dj-stats");stats.replaceChildren(
    stat("AANVRAGEN",requests.length,"♫"),
    stat("IN WACHTRIJ",count("queued"),"☷"),
    stat("GESPEELD",count("played"),"✓"),
    stat("MUZIEK GEKOZEN",formatMusicTime(musicRequested),"♧"),
    stat("NOG TE SPELEN",formatMusicTime(musicRemaining),"⌛")
  );
  const queueOrder=data.queueOrder||[];
  renderDeck(requests,queueOrder);
  const queuedRequests=orderedQueued(requests,queueOrder);
  const nextQueued=queuedRequests[0]||null;
  setBoothDeck("right",nextQueued?{name:nextQueued.track_name,artist:nextQueued.artist_name,album_image_url:nextQueued.album_image_url}:spotifyQueuePreview);
  const nextButton=document.querySelector("#partyqueue-next");
  if(nextButton){
    const empty=queuedRequests.length===0;
    nextButton.disabled=empty;
    nextButton.classList.toggle("is-fallback",empty);
    nextButton.classList.toggle("is-empty",false);
    nextButton.textContent=empty?"SPOTIFY":"NEXT ↗";
    nextButton.title=empty?"Spotify fallback mode · PartyQueue queue is empty":"Play next PartyQueue request";
    nextButton.setAttribute("aria-label",empty?"Spotify fallback mode; PartyQueue queue is empty":"Play next PartyQueue request");
  }
  document.querySelector("#request-count").textContent=requests.length+" REQUESTS";
  document.querySelector("#last-updated").textContent="SYNCED "+new Date().toLocaleTimeString();
  requestList.replaceChildren();
  if(queueDragId)return;
  const live=requests.filter(r=>["pending","approved","queued"].includes(r.status));
  if(!live.length){requestList.append(el("p","dj-empty","No incoming requests. The dancefloor is waiting…"));return;}
  const queuedOrder=orderedQueued(live,queueOrder);
  const queuePositions=new Map(queuedOrder.map((r,i)=>[r.id,i]));
  for(const r of live){
    const isQueued=r.status==="queued";
    const card=el("article","dj-request"+(isQueued?" dj-request-queued":""));
    card.dataset.requestId=r.id;
    if(isQueued){
      card.draggable=true;
      card.dataset.queueIndex=String(queuePositions.get(r.id));
      const grip=el("span","queue-drag-handle","⠿");
      grip.title="Sleep om de afspeelvolgorde te wijzigen";
      grip.setAttribute("aria-hidden","true");
      card.append(grip);
    }
    addCover(card,r.album_image_url,"dj-cover");
    const info=el("div","dj-track");
    if(isQueued)card.append(el("span","queue-position",String(queuePositions.get(r.id)+1).padStart(2,"0")));
    info.append(el("strong","dj-track-name",r.track_name),el("span","dj-muted",r.artist_name),el("span","dj-requester","REQUESTED BY "+(r.nickname||"GUEST").toUpperCase()));
    info.append(el("span","dj-status status-"+r.status,r.status.replace("_"," ").toUpperCase()));card.append(info);
    const actions=el("div","dj-actions");
    const addAction=(action,label,cls)=>{const b=el("button",cls,label);b.type="button";b.addEventListener("click",()=>runAction(r.id,action,b));actions.append(b);};
    if(r.status==="pending")addAction("approve","✓ APPROVE","dj-action dj-positive");
    if(r.status==="approved")addAction("queue","＋ CUE TO QUEUE","dj-action dj-positive");
    if(["pending","approved","queued"].includes(r.status))addAction("reject","✕ REJECT","dj-action dj-negative");
    if(["approved","queued"].includes(r.status))addAction("played","MARK PLAYED","dj-action");
    if(actions.childElementCount)card.append(actions);
    requestList.append(card);
  }
}
async function saveQueueOrder(order){
  if(queueReorderBusy)return;
  queueReorderBusy=true;
  message.textContent="Saving new play order…";
  try{
    await api("/api/dj/queue/reorder",{method:"POST",body:JSON.stringify({order})});
    message.textContent="Play order updated.";
    await refresh();
  }catch(e){message.textContent=e.message;await refresh();}
  finally{queueReorderBusy=false;}
}
requestList.addEventListener("dragstart",event=>{
  const card=event.target.closest(".dj-request-queued");
  if(!card)return;
  queueDragId=card.dataset.requestId;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed="move";
  event.dataTransfer.setData("text/plain",queueDragId);
});
requestList.addEventListener("dragover",event=>{
  if(!queueDragId)return;
  const target=event.target.closest(".dj-request-queued");
  if(!target||target.dataset.requestId===queueDragId)return;
  event.preventDefault();
  event.dataTransfer.dropEffect="move";
  requestList.querySelectorAll(".dj-request-queued").forEach(card=>card.classList.toggle("drop-before",card===target&&event.clientY<target.getBoundingClientRect().top+target.offsetHeight/2));
  target.classList.toggle("drop-after",event.clientY>=target.getBoundingClientRect().top+target.offsetHeight/2);
});
requestList.addEventListener("drop",async event=>{
  if(!queueDragId)return;
  const target=event.target.closest(".dj-request-queued");
  if(!target||target.dataset.requestId===queueDragId)return;
  event.preventDefault();
  const order=[...requestList.querySelectorAll(".dj-request-queued")].map(card=>card.dataset.requestId);
  const from=order.indexOf(queueDragId),to=order.indexOf(target.dataset.requestId);
  if(from>=0&&to>=0){const [moved]=order.splice(from,1);const insertAt=event.clientY<target.getBoundingClientRect().top+target.offsetHeight/2?to:to+1;order.splice(insertAt>from?insertAt-1:insertAt,0,moved);}
  queueDragId=null;
  await saveQueueOrder(order);
});
requestList.addEventListener("dragend",()=>{
  queueDragId=null;
  requestList.querySelectorAll(".dj-request-queued").forEach(card=>card.classList.remove("is-dragging","drop-before","drop-after"));
});
async function refresh(){
  try{const data=await api("/api/dj/overview");render(data);}
  catch(e){if(e.message.toLowerCase().includes("sessie")){logout();return;}message.textContent=e.message;}
}
async function runAction(id,action,button){
  button.disabled=true;message.textContent="Sending command to the booth…";
  try{if(action==="queue") await api("/api/dj/spotify/queue/"+encodeURIComponent(id),{method:"POST"});else await api("/api/dj/requests/"+encodeURIComponent(id)+"/"+action,{method:"POST"});message.textContent="Deck updated.";await refresh();}
  catch(e){message.textContent=e.message;button.disabled=false;}
}
async function updateSetting(key,enabled){
  message.textContent="Updating party controls…";
  try{await api("/api/dj/settings/"+key,{method:"POST",body:JSON.stringify({enabled})});message.textContent="Party controls updated.";await refresh();}
  catch(e){message.textContent=e.message;}
}
function logout(){token="";clearDjToken();setLoggedIn(false);}
loginForm.addEventListener("submit",async e=>{
  e.preventDefault();const button=loginForm.querySelector("button");button.disabled=true;loginMessage.textContent="Checking DJ access…";
  try{const response=await fetch("/api/dj/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:new FormData(loginForm).get("code")})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Login failed");token=data.token;saveDjToken(token);loginForm.reset();loginMessage.textContent="";setLoggedIn(true);}
  catch(e){loginMessage.textContent=e.message;}
  finally{button.disabled=false;}
});
document.querySelector("#dj-logout").addEventListener("click",logout);
document.querySelector("#pause-toggle").addEventListener("click",()=>updateSetting("requests_paused",!currentSettings.requestsPaused));
document.querySelector("#approval-toggle").addEventListener("click",()=>updateSetting("auto_approve",!currentSettings.autoApprove));
document.querySelector("#auto-queue-toggle").addEventListener("click",()=>updateSetting("auto_queue",!currentSettings.autoQueue));

async function refreshSpotify(){
  // The coordinator blocks polls during transport commands and rejects stale responses.
  const requestId=playback.beginStatus();
  if(requestId===null)return;
  const state=document.querySelector("#spotify-connection-state");
  const device=document.querySelector("#spotify-device");
  const now=document.querySelector("#spotify-now-playing");
  try{
    const data=await api("/api/dj/spotify/status");
    if(!playback.isStatusCurrent(requestId))return;
    const playbackSummary=getSpotifyPlaybackSummary(data);
    state.textContent=playbackSummary.connection;
    const booth=document.querySelector("#partyqueue-booth");
    if(booth){
      booth.classList.toggle("is-playing",!!data.playing);
      document.querySelector("#booth-play-state").textContent=data.fallbackActive?"SPOTIFY MIX":data.playing?"ON AIR":"STANDBY";
      setBoothDeck("left",data.track?{name:data.track.name,artists:data.track.artists,image:data.track.image}:null);
      spotifyQueuePreview=data.fallbackActive?data.nextTrack:null;
      const nextButton=document.querySelector("#partyqueue-next");
      if(nextButton?.disabled)setBoothDeck("right",spotifyQueuePreview);
      updateTrackProgress(data.progressMs,data.track?.durationMs,data.playing);
    }
    state.classList.toggle("accent",!!data.connected);
    document.querySelector("#spotify-connect")?.classList.toggle("is-connected",!!data.connected);
    syncPlaybackButtons(!!data.connected,!!data.playing);
    if(data.fallbackActive)document.querySelector("#booth-play-state").textContent="SPOTIFY MIX";
    device.textContent=playbackSummary.device;
    if(playbackSummary.volume!==null){updateMasterVolumeDisplay(playbackSummary.volume);document.querySelector("#master-volume-status").textContent="SPOTIFY MASTER OUTPUT";}
    else{document.querySelector("#master-volume-status").textContent="NO ACTIVE SPOTIFY DEVICE";}
    now.textContent=playbackSummary.nowPlaying;
  }catch(e){
    if(!spotifyStatusRequests.isCurrent(requestId))return;
    state.textContent="NOT CONNECTED";
    document.querySelector("#spotify-connect")?.classList.remove("is-connected");
    syncPlaybackButtons(false,false);
    const booth=document.querySelector("#partyqueue-booth");
    if(booth){booth.classList.remove("is-playing");document.querySelector("#booth-play-state").textContent="OFFLINE";setBoothDeck("left",null);updateTrackProgress(0,0,false);}
    device.textContent=e.message;
    now.textContent="Connect your Spotify account to enable live playback.";
  }finally{
    playback.completeStatus(requestId);
  }
}
const masterVolume=document.querySelector("#master-volume");
masterVolume.addEventListener("input",()=>updateMasterVolumeDisplay(masterVolume.value));
masterVolume.addEventListener("change",()=>{
  const value=normalizeSpotifyVolume(masterVolume.value);
  document.querySelector("#master-volume-status").textContent="SETTING SPOTIFY VOLUME…";
  volumeWrites.enqueue(value).catch(()=>{});
});
document.querySelector("#spotify-connect").addEventListener("click",async()=>{
  const button=document.querySelector("#spotify-connect");button.disabled=true;message.textContent="Opening Spotify authorization…";
  try{const data=await api("/api/dj/spotify/connect",{method:"POST"});window.location.href=data.url;}
  catch(e){message.textContent=e.message;button.disabled=false;}
});
document.querySelectorAll("[data-spotify-command]").forEach(button=>button.addEventListener("click",async()=>{
  button.disabled=true;
  try{
    await playback.runCommand(button.dataset.spotifyCommand);
  }finally{
    button.disabled=false;
  }
}));

const aiForm=document.querySelector("#dj-ai-form");
async function askDJAI(prompt,mode="advice"){
  const input=document.querySelector("#dj-ai-prompt");
  const button=document.querySelector("#dj-ai-submit");
  const output=document.querySelector("#dj-ai-answer");
  const actionButtons=[...document.querySelectorAll("[data-ai-action]")];
  button.disabled=true;actionButtons.forEach(b=>b.disabled=true);
  output.textContent="DJ#DATUUR AI denkt even mee…";
  try{
    const result=mode==="import"?{answer:prompt,cached:false}:await api("/api/dj/ai/assistant",{method:"POST",body:JSON.stringify({prompt})});
    const answer=result.answer||"Geen advies ontvangen.";
    if(mode==="advice"&&result.spotifyMatches?.length)mode="fill";
    if(mode==="optimize"){
      output.textContent=answer+"\n\nWachtrij wordt gecontroleerd…";
      const overview=await api("/api/dj/overview");
      const queued=orderedQueued(overview.requests||[],overview.queueOrder||[]);
      const { ids, unmatchedLines } = matchDjQueueProposal(answer, queued);
      if(queued.length&&ids.length===queued.length&&new Set(ids).size===queued.length){
        output.replaceChildren(el("p","",answer));
        const confirmPanel=el("div","dj-ai-confirm-panel");
        confirmPanel.append(el("p","dj-ai-results-hint","Alle "+queued.length+" nummers zijn herkend. Wil je deze nieuwe volgorde toepassen op UP NEXT?"));
        const confirmButton=el("button","dj-ai-add","✓ JA, PAS VOLGORDE TOE");
        confirmButton.type="button";
        const cancelButton=el("button","dj-ai-cancel","ANNULEREN");
        cancelButton.type="button";
        confirmButton.addEventListener("click",async()=>{
          confirmButton.disabled=true;cancelButton.disabled=true;confirmButton.textContent="VOLGORDE OPSLAAN…";
          try{
            await api("/api/dj/queue/reorder",{method:"POST",body:JSON.stringify({order:ids})});
            output.replaceChildren(el("p","",answer),el("p","dj-ai-results-hint","✓ Wachtrij effectief herschikt. De nieuwe volgorde is opgeslagen."));
            await refresh();
          }catch(error){
            confirmButton.disabled=false;cancelButton.disabled=false;confirmButton.textContent="✓ JA, PAS VOLGORDE TOE";
            output.append(el("p","dj-ai-results-hint","Opslaan mislukt: "+error.message));
          }
        });
        cancelButton.addEventListener("click",()=>{
          output.replaceChildren(el("p","",answer),el("p","dj-ai-results-hint","Voorstel geannuleerd. Je huidige wachtrij blijft ongewijzigd."));
        });
        confirmPanel.append(confirmButton,cancelButton);output.append(confirmPanel);
      }else{
        output.textContent=answer+"\n\n⚠️ Ik kon slechts "+ids.length+" van de "+queued.length+" nummers eenduidig koppelen. Er is niets gewijzigd. Niet herkend: "+(unmatchedLines.length?unmatchedLines.join(" | "):"controleer of de AI alle wachtrijtracks heeft opgenomen.");
      }
    }else if(mode==="starter"||mode==="fill"||mode==="import"){
      const suggestions=extractDjTrackSuggestions(answer,result.spotifyMatches);
      output.replaceChildren();
      const intro=el("p","",answer);
      output.append(intro);
      if(suggestions.length){
        const hint=el("p","dj-ai-results-hint",mode==="import"?"Je lijst is herkend. Kies per nummer de juiste Spotify-uitvoering om die rechtstreeks aan UP NEXT toe te voegen.":"Spotify-matches — kies de juiste uitvoering om die rechtstreeks aan UP NEXT toe te voegen.");
        output.append(hint);
        const results=result.spotifyMatches?.length
          ? {results:result.spotifyMatches}
          : await api("/api/dj/ai/music/search",{method:"POST",body:JSON.stringify({queries:suggestions})});
        const selectedTracks=[];
      let groupIndex=0;
      for(const group of results.results||[]){
        const groupBox=el("div","dj-ai-suggestion");
        groupBox.append(el("strong","dj-ai-query",group.query));
        if(!group.tracks?.length)groupBox.append(el("span","dj-ai-no-match","Geen Spotify-match gevonden."));
        (group.tracks||[]).forEach((track,trackIndex)=>{
          const option=el("label","dj-ai-track");
          const pick=document.createElement("input");
          pick.type="radio";pick.name="dj-ai-pick-"+groupIndex;pick.value=track.id;
          pick.checked=trackIndex===0;
          pick.addEventListener("change",()=>{});
          const chosen={track,group:group.query,pick};
          selectedTracks.push(chosen);
          if(track.albumImageUrl){const cover=el("img","dj-ai-track-cover");cover.src=track.albumImageUrl;cover.alt="";option.append(cover);}
          const details=el("div","dj-ai-track-details");
          details.append(el("strong","",track.name),el("span","",track.artists.join(", ")));
          option.append(pick,details);groupBox.append(option);
        });
        output.append(groupBox);
        groupIndex++;
      }
      const addSelected=el("button","dj-ai-add","＋ VOEG GESELECTEERDE NUMMERS TOE AAN UP NEXT");
      addSelected.type="button";
      addSelected.addEventListener("click",async()=>{
        const chosen=selectedTracks.filter(item=>item.pick.checked);
        if(!chosen.length)return;
        addSelected.disabled=true;addSelected.textContent="NUMMERS WORDEN TOEGEVOEGD…";
        let added=0,alreadyThere=0,failed=[];
        for(const item of chosen){
          try{
            const result=await api("/api/dj/ai/music/add",{method:"POST",body:JSON.stringify({trackId:item.track.id})});
            if(result.alreadyQueued)alreadyThere++;
            else added++;
          }catch(error){failed.push(item.track.name+": "+error.message);}
        }
        await refresh();
        addSelected.textContent=added+" NUMMERS TOEGEVOEGD";
        const parts=[];
        if(added)parts.push(added+" nieuw toegevoegd aan UP NEXT");
        if(alreadyThere)parts.push(alreadyThere+" stonden al in de actieve wachtrij en zijn overgeslagen");
        if(!parts.length)parts.push("Geen nieuwe nummers toegevoegd");
        if(failed.length)parts.push("Fouten: "+failed.join("; "));
        output.append(el("p","dj-ai-results-hint",parts.join(". ")+"."));

      });
      output.append(addSelected);
      }else{
        output.append(el("p","dj-ai-results-hint","Ik kon geen genummerde tracks uit het antwoord halen. Vraag de AI om een lijst met Titel — Artiest."));
      }
    }else{
      output.textContent=(result.cached?"↻ Eerder advies (wachtrij ongewijzigd)\n\n":"")+answer;
    }
    if(result.memoryUpdated)output.append(el("p","dj-ai-results-hint","✓ DJ-voorkeur opgeslagen in het geheugen van dit event."));
    input.value="";
  }catch(error){output.textContent=error.message;}
  finally{button.disabled=false;actionButtons.forEach(b=>b.disabled=false);}
}
aiForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const prompt=document.querySelector("#dj-ai-prompt").value.trim();
  if(prompt){const out=document.querySelector("#dj-ai-answer");const importIntent=/\b(zet|voeg|importeer|plaats)\b[\s\S]{0,100}\b(lijst|muzieklijst|nummers|tracks|wachtrij|up\s*next)\b/i.test(prompt);const reorderIntent=/\b(optimaliseer|herschik|herorden|verplaats|zet)\b/i.test(prompt)&&/\b(wachtrij|up\s*next|volgorde|blok|tussen|ballades|stijl|genre|jaren|90s|80s|70s)\b/i.test(prompt);const extractTracks=value=>value.split(/\r?\n/).filter(line=>/^\s*\d+[.)]\s*.+\s+[—–-]\s+.+/.test(line));let source=prompt;let trackLines=extractTracks(source);if(importIntent&&trackLines.length===0){const previous=out.innerText||out.textContent||"";const previousTracks=extractTracks(previous);if(previousTracks.length>=2){source=previousTracks.join("\\n");trackLines=previousTracks;}}if(reorderIntent){await askDJAI("Pas deze DJ-instructie toe op de volledige huidige UP NEXT-wachtrij: "+prompt+". Geef ALLEEN een genummerde lijst met alle bestaande tracks exact één keer, geen nummers toevoegen of weglaten.", "optimize");}else if(importIntent&&trackLines.length>0){await askDJAI(source,"import");}else if(importIntent){await askDJAI("De DJ wil deze specifieke track(s) toevoegen aan UP NEXT. Geef alleen de gevraagde track(s) als genummerde lijst in exact het formaat Titel — Artiest. Voeg geen andere suggesties toe. Verzoek: "+prompt,"fill");}else{await askDJAI(source,"advice");}}
});
document.querySelectorAll("[data-ai-action]").forEach(button=>button.addEventListener("click",async()=>{
  const action=button.dataset.aiAction;
  if(action==="optimize"){
    await askDJAI("Optimaliseer de volledige huidige PartyQueue wachtrij als een creatieve DJ-set. Je mag bewust van stijl, genre, tempo en decennium veranderen: zet gerust een herkenbaar 90s-blok tussen ballades, bouw disco/dance-blokken of maak een onverwachte energieboost. Forceer geen vloeiende overgangen en behoud niet automatisch de huidige stijl. Gebruik de volledige tracklijst exact één keer per nummer; voeg geen tracks toe en laat er geen weg. Geef ALLEEN een genummerde lijst in het formaat Titel — Artiest, zonder intro of uitleg. Als er minder dan twee tracks zijn, zeg dat.","optimize");
  }else if(action==="starter"){
    await askDJAI("Maak een gevarieerde basisselectie van 12 bekende, feestgeschikte nummers voor een Oud & Nieuw-feest in België. Bouw op van warm-up naar dansvloer en meezingers. Geef een genummerde lijst met exact Titel — Artiest en vermeld kort waarom de set werkt.","starter");
  }else{
    await askDJAI("Stel 8 externe nummers voor die goed aansluiten op de huidige PartyQueue wachtrij en de energie geleidelijk verhogen richting een Oud & Nieuw-feest. Vermijd artiesten en tracks die al in UP NEXT of recent gespeeld staan. Geef een genummerde lijst met exact Titel — Artiest en markeer dit als suggesties buiten de wachtrij.","fill");
  }
}));

const chatGPTButton=document.querySelector("#dj-chatgpt-help");
chatGPTButton?.addEventListener("click",async()=>{
  const output=document.querySelector("#dj-ai-answer");
  const overview=latestDJOverview;
  if(!overview){
    output.textContent="De actuele DJ-consolegegevens zijn nog niet geladen. Probeer opnieuw zodra UP NEXT zichtbaar is.";
    return;
  }
  const queued=orderedQueued(overview.requests||[],overview.queueOrder||[]);
  const nowPlaying=(document.querySelector("#spotify-now-playing")?.textContent||"Niet beschikbaar").trim();
  const queueText=queued.length
    ? queued.map((track,index)=>(index+1)+". "+track.track_name+" — "+track.artist_name).join("\n")
    : "(UP NEXT is momenteel leeg)";
  const prompt=[
    "Je bent mijn tweede DJ-adviseur voor DJ#DATUUR / PartyQueue, een Oud & Nieuw-feest in België.",
    "Geef advies in het Nederlands. Denk creatief en durf bewust van genre, decennium en energie te wisselen. Forceer geen vloeiende overgangen.",
    "Gebruik de live context hieronder. Beweer niet dat je de muziek of het publiek hoort of ziet. Voeg niets zelf toe aan Spotify of PartyQueue; geef alleen een voorstel dat ik zelf kan uitvoeren.",
    "",
    "MOMENTEEL OP SPOTIFY:",
    nowPlaying,
    "",
    "UP NEXT ("+queued.length+" tracks):",
    queueText,
    "",
    "Geef een concreet DJ-advies op basis van deze huidige set. Benoem eventuele zwakke plekken en geef bruikbare alternatieven. Bewaar alle bestaande tracks wanneer je een nieuwe volgorde voorstelt."
  ].join("\n");
  window.open("https://chatgpt.com/","_blank","noopener,noreferrer");
  chatGPTButton.disabled=true;
  try{
    await navigator.clipboard.writeText(prompt);
    output.textContent="✓ De actuele UP NEXT-lijst en Spotify-status zijn gekopieerd. ChatGPT is in een apart tabblad geopend: plak daar de context met Ctrl+V. Dit gebruikt je gewone ChatGPT-account, geen API.";
  }catch(error){
    output.textContent="ChatGPT is geopend, maar het kopiëren naar het klembord is geblokkeerd. Fout: "+(error?.message||"onbekend")+".";
  }finally{
    chatGPTButton.disabled=false;
  }
});

if(token)setLoggedIn(true);


document.querySelector("#partyqueue-next").addEventListener("click",async()=>{
  const button=document.querySelector("#partyqueue-next");
  button.disabled=true;
  message.textContent="Loading next PartyQueue request…";
  try{
    const result=await api("/api/dj/spotify/next-request",{method:"POST"});
    if(result.busy){message.textContent=result.error||"NEXT wordt al verwerkt.";return;}
    if(!result.track){message.textContent="Er is geen volgende PartyQueue-aanvraag gestart.";return;}
    spotifyQueuePreview=null;
    setBoothDeck("right",null);
    message.textContent="Now playing PartyQueue request: "+result.track.name+" — "+result.track.artist;
    await refresh();
    await refreshSpotify();
  }catch(e){
    message.textContent=e.message;
  }finally{
    await refresh();
  }
});
