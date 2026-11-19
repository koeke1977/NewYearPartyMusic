const loginCard=document.querySelector("#dj-login-card");
const loginForm=document.querySelector("#dj-login-form");
const loginMessage=document.querySelector("#dj-login-message");
const consoleView=document.querySelector("#dj-console");
const requestList=document.querySelector("#dj-requests");
const message=document.querySelector("#dj-message");
let token=localStorage.getItem("partyqueue_dj_token")||"";
let pollHandle=null;
let currentSettings={requestsPaused:false,autoApprove:true,autoQueue:false};
let spotifyQueuePreview=null;
let spotifyStatusRequest=0;
let queueDragId=null;
let queueReorderBusy=false;
const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
async function api(path,options={}){
  const response=await fetch(path,{...options,headers:{...(options.headers||{}),Authorization:"Bearer "+token,...(options.body?{"Content-Type":"application/json"}:{})}});
  const data=await response.json().catch(()=>({error:"Ongeldig antwoord van server."}));
  if(!response.ok)throw new Error(data.error||"Request failed");
  return data;
}
function setLoggedIn(on){
  loginCard.hidden=on;consoleView.hidden=!on;
  if(on){refresh();refreshSpotify();if(pollHandle)clearInterval(pollHandle);pollHandle=setInterval(()=>{refresh();refreshSpotify();},5000);}
  else if(pollHandle){clearInterval(pollHandle);pollHandle=null;}
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
function orderedQueued(requests,queueOrder=[]){
  const positions=new Map((Array.isArray(queueOrder)?queueOrder:[]).map((id,index)=>[id,index]));
  return requests.filter(r=>r.status==="queued").sort((a,b)=>
    (positions.get(a.id)??Number.MAX_SAFE_INTEGER)-(positions.get(b.id)??Number.MAX_SAFE_INTEGER)||
    (a.queued_at||a.requested_at||"").localeCompare(b.queued_at||b.requested_at||"")
  );
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
  const volume=Math.max(0,Math.min(100,Number(value)||0));
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
function formatTrackTime(milliseconds){
  const total=Math.max(0,Math.floor((Number(milliseconds)||0)/1000));
  return Math.floor(total/60)+":"+String(total%60).padStart(2,"0");
}
function updateTrackProgress(progressMs,durationMs,playing){
  const duration=Math.max(0,Number(durationMs)||0);
  const progress=Math.max(0,Math.min(duration,Number(progressMs)||0));
  const percent=duration?Math.round(progress/duration*100):0;
  const leds=document.querySelector("#track-progress-leds");
  const value=document.querySelector("#track-progress-value");
  const elapsed=document.querySelector("#track-progress-elapsed");
  const total=document.querySelector("#track-progress-duration");
  const status=document.querySelector("#track-progress-status");
  if(value)value.textContent=duration?percent+"%":"—%";
  if(elapsed)elapsed.textContent=formatTrackTime(progress);
  if(total)total.textContent=formatTrackTime(duration);
  if(status)status.textContent=!duration?"WAITING FOR TRACK":playing?"TRACK PLAYING":"TRACK PAUSED";
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
  const play=document.querySelector('[data-spotify-command="play"]');
  const pause=document.querySelector('[data-spotify-command="pause"]');
  [[play,!!connected&&!!playing],[pause,!!connected&&!playing]].forEach(([button,active])=>{
    if(!button)return;
    button.classList.toggle("is-selected",active);
    button.classList.toggle("is-idle",!active);
    button.setAttribute("aria-pressed",String(active));
  });
  const booth=document.querySelector("#partyqueue-booth");
  if(booth){
    booth.classList.toggle("is-playing",!!connected&&!!playing);
    const status=document.querySelector("#booth-play-state");
    if(status)status.textContent=!connected?"OFFLINE":playing?"ON AIR":"PAUSED";
  }
}
function render(data){
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
function logout(){token="";localStorage.removeItem("partyqueue_dj_token");setLoggedIn(false);}
loginForm.addEventListener("submit",async e=>{
  e.preventDefault();const button=loginForm.querySelector("button");button.disabled=true;loginMessage.textContent="Checking DJ access…";
  try{const response=await fetch("/api/dj/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:new FormData(loginForm).get("code")})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Login failed");token=data.token;localStorage.setItem("partyqueue_dj_token",token);loginForm.reset();loginMessage.textContent="";setLoggedIn(true);}
  catch(e){loginMessage.textContent=e.message;}
  finally{button.disabled=false;}
});
document.querySelector("#dj-logout").addEventListener("click",logout);
document.querySelector("#pause-toggle").addEventListener("click",()=>updateSetting("requests_paused",!currentSettings.requestsPaused));
document.querySelector("#approval-toggle").addEventListener("click",()=>updateSetting("auto_approve",!currentSettings.autoApprove));
document.querySelector("#auto-queue-toggle").addEventListener("click",()=>updateSetting("auto_queue",!currentSettings.autoQueue));

async function refreshSpotify(){
  const requestId=++spotifyStatusRequest;
  const state=document.querySelector("#spotify-connection-state");
  const device=document.querySelector("#spotify-device");
  const now=document.querySelector("#spotify-now-playing");
  try{
    const data=await api("/api/dj/spotify/status");
    if(requestId!==spotifyStatusRequest)return;
    state.textContent=data.connected?"CONNECTED":"NOT CONNECTED";
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
    if(data.device){device.textContent="ACTIVE DEVICE · "+data.device.name+" ("+data.device.type+")";if(typeof data.device.volume==="number"){updateMasterVolumeDisplay(data.device.volume);document.querySelector("#master-volume-status").textContent="SPOTIFY MASTER OUTPUT";}}
    else{device.textContent="Spotify is connected. Open Spotify on a device to make it active.";document.querySelector("#master-volume-status").textContent="NO ACTIVE SPOTIFY DEVICE";}
    now.textContent=data.autoAdvanceError?"AUTO NEXT ERROR · "+data.autoAdvanceError:data.fallbackError?"FALLBACK ERROR · "+data.fallbackError:data.track?(data.playing?"▶ NOW PLAYING · ":"Ⅱ PAUSED · ")+data.track.name+" — "+data.track.artists.join(", "):"No track is currently playing.";
  }catch(e){
    if(requestId!==spotifyStatusRequest)return;
    state.textContent="NOT CONNECTED";
    document.querySelector("#spotify-connect")?.classList.remove("is-connected");
    syncPlaybackButtons(false,false);
    const booth=document.querySelector("#partyqueue-booth");
    if(booth){booth.classList.remove("is-playing");document.querySelector("#booth-play-state").textContent="OFFLINE";setBoothDeck("left",null);updateTrackProgress(0,0,false);}
    device.textContent=e.message;
    now.textContent="Connect your Spotify account to enable live playback.";
  }
}
const masterVolume=document.querySelector("#master-volume");
masterVolume.addEventListener("input",()=>updateMasterVolumeDisplay(masterVolume.value));
masterVolume.addEventListener("change",async()=>{
  const value=Number(masterVolume.value);
  const status=document.querySelector("#master-volume-status");
  status.textContent="SETTING SPOTIFY VOLUME…";
  try{
    await api("/api/dj/spotify/volume",{method:"PUT",body:JSON.stringify({volume:value})});
    status.textContent="SPOTIFY MASTER OUTPUT";
    updateMasterVolumeDisplay(value);
  }catch(e){status.textContent=e.message;await refreshSpotify();}
});
document.querySelector("#spotify-connect").addEventListener("click",async()=>{
  const button=document.querySelector("#spotify-connect");button.disabled=true;message.textContent="Opening Spotify authorization…";
  try{const data=await api("/api/dj/spotify/connect",{method:"POST"});window.location.href=data.url;}
  catch(e){message.textContent=e.message;button.disabled=false;}
});
document.querySelectorAll("[data-spotify-command]").forEach(button=>button.addEventListener("click",async()=>{
  const action=button.dataset.spotifyCommand;button.disabled=true;
  try{await api("/api/dj/spotify/"+action,{method:"POST"});if(action==="play")syncPlaybackButtons(true,true);if(action==="pause")syncPlaybackButtons(true,false);message.textContent="Spotify command sent.";/* Keep the immediate hardware feedback; the regular status poll will reconcile with Spotify. */}
  catch(e){message.textContent=e.message;}
  finally{button.disabled=false;}
}));

if(token)setLoggedIn(true);


document.querySelector("#partyqueue-next").addEventListener("click",async()=>{
  const button=document.querySelector("#partyqueue-next");
  button.disabled=true;
  message.textContent="Loading next PartyQueue request…";
  try{
    const result=await api("/api/dj/spotify/next-request",{method:"POST"});
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
