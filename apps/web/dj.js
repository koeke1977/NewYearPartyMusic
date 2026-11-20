import { createDjApi } from "./modules/dj-api.js";
import { clearDjToken, getSavedDjToken, saveDjToken } from "./modules/dj-session.js";
import { element as el } from "./modules/dom.js";
import { orderedQueued } from "./modules/dj-queue.js";
import { createDjPollingController } from "./modules/dj-polling.js";
import { createDjPlaybackCoordinator } from "./modules/dj-playback-coordinator.js";
import { buildDjChatGptPrompt } from "./modules/dj-chatgpt-handoff.js";
import { createDjOverviewModel } from "./modules/dj-overview-model.js";
import { createDjQueueReorderController } from "./modules/dj-queue-reorder.js";
import { createDjCommandService } from "./modules/dj-command-service.js";
import { createDjSpotifyConsole } from "./modules/dj-spotify-console.js";
import { createDjAiAssistant } from "./modules/dj-ai-assistant.js";

const loginCard=document.querySelector("#dj-login-card");
const loginForm=document.querySelector("#dj-login-form");
const loginMessage=document.querySelector("#dj-login-message");
const consoleView=document.querySelector("#dj-console");
const requestList=document.querySelector("#dj-requests");
const message=document.querySelector("#dj-message");
let token=getSavedDjToken();
let currentSettings={requestsPaused:false,autoApprove:true,autoQueue:false};
let spotifyQueuePreview=null;
let latestDJOverview=null;
const api=createDjApi(()=>token);
const commands=createDjCommandService({api,refresh:()=>refresh(),onMessage:text=>{message.textContent=text;}});
let playback;
const spotifyConsole=createDjSpotifyConsole({api,getPlayback:()=>playback,onMessage:text=>{message.textContent=text;},onQueuePreview:track=>{spotifyQueuePreview=track;}});
playback=createDjPlaybackCoordinator({
  getToken:()=>token,
  sendCommand:action=>api("/api/dj/spotify/"+action,{method:"POST"}),
  refreshStatus:()=>spotifyConsole.refreshStatus(),
  onCommandSuccess:action=>{
    if(action==="play")spotifyConsole.syncPlaybackButtons(true,true);
    if(action==="pause")spotifyConsole.syncPlaybackButtons(true,false);
    message.textContent="Spotify command sent.";
  },
  onCommandError:error=>{message.textContent=error.message;},
});
spotifyConsole.bindControls();
const polling=createDjPollingController(refresh,()=>spotifyConsole.refreshStatus());
function setLoggedIn(on){
  loginCard.hidden=on;consoleView.hidden=!on;
  if(on)polling.start();
  else { polling.stop(); playback.invalidate(); spotifyConsole.invalidate(); }
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

  const overview=createDjOverviewModel(data);
  const {requests,queueOrder,queued,liveRequests,queuePositions,nextQueued}=overview;
  const stats=document.querySelector("#dj-stats");stats.replaceChildren(
    stat("AANVRAGEN",overview.counts.total,"♫"),
    stat("IN WACHTRIJ",overview.counts.queued,"☷"),
    stat("GESPEELD",overview.counts.played,"✓"),
    stat("MUZIEK GEKOZEN",formatMusicTime(overview.durations.requested),"♧"),
    stat("NOG TE SPELEN",formatMusicTime(overview.durations.remaining),"⌛")
  );
  renderDeck(requests,queueOrder);
  spotifyConsole.setDeck("right",nextQueued?{name:nextQueued.track_name,artist:nextQueued.artist_name,album_image_url:nextQueued.album_image_url}:spotifyQueuePreview);
  const nextButton=document.querySelector("#partyqueue-next");
  if(nextButton){
    const empty=queued.length===0;
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
  if(queueReorder.isDragging())return;
  if(!liveRequests.length){requestList.append(el("p","dj-empty","No incoming requests. The dancefloor is waiting…"));return;}
  for(const r of liveRequests){
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
    const addAction=(action,label,cls)=>{const b=el("button",cls,label);b.type="button";b.addEventListener("click",()=>commands.runRequestAction(r.id,action,b));actions.append(b);};
    if(r.status==="pending")addAction("approve","✓ APPROVE","dj-action dj-positive");
    if(r.status==="approved")addAction("queue","＋ CUE TO QUEUE","dj-action dj-positive");
    if(["pending","approved","queued"].includes(r.status))addAction("reject","✕ REJECT","dj-action dj-negative");
    if(["approved","queued"].includes(r.status))addAction("played","MARK PLAYED","dj-action");
    if(actions.childElementCount)card.append(actions);
    requestList.append(card);
  }
}
const queueReorder=createDjQueueReorderController(requestList,order=>commands.saveQueueOrder(order));
async function refresh(){
  try{const data=await api("/api/dj/overview");render(data);}
  catch(e){if(e.message.toLowerCase().includes("sessie")){logout();return;}message.textContent=e.message;}
}
function logout(){token="";clearDjToken();setLoggedIn(false);}
loginForm.addEventListener("submit",async e=>{
  e.preventDefault();const button=loginForm.querySelector("button");button.disabled=true;loginMessage.textContent="Checking DJ access…";
  try{const response=await fetch("/api/dj/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:new FormData(loginForm).get("code")})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Login failed");token=data.token;saveDjToken(token);loginForm.reset();loginMessage.textContent="";setLoggedIn(true);}
  catch(e){loginMessage.textContent=e.message;}
  finally{button.disabled=false;}
});
document.querySelector("#dj-logout").addEventListener("click",logout);
document.querySelector("#pause-toggle").addEventListener("click",()=>commands.updateSetting("requests_paused",!currentSettings.requestsPaused));
document.querySelector("#approval-toggle").addEventListener("click",()=>commands.updateSetting("auto_approve",!currentSettings.autoApprove));
document.querySelector("#auto-queue-toggle").addEventListener("click",()=>commands.updateSetting("auto_queue",!currentSettings.autoQueue));

createDjAiAssistant({api,refresh:()=>refresh()});

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
  const prompt=buildDjChatGptPrompt({queuedTracks:queued,nowPlaying});
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
    spotifyConsole.setDeck("right",null);
    message.textContent="Now playing PartyQueue request: "+result.track.name+" — "+result.track.artist;
    await refresh();
    await spotifyConsole.refreshStatus();
  }catch(e){
    message.textContent=e.message;
  }finally{
    await refresh();
  }
});
