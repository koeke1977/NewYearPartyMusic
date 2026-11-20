import { createDjApi } from "./modules/dj-api.js";
import { createDjPollingController } from "./modules/dj-polling.js";
import { createDjPlaybackCoordinator } from "./modules/dj-playback-coordinator.js";
import { bindDjChatGptHandoff } from "./modules/dj-chatgpt-handoff.js";
import { createDjOverviewView } from "./modules/dj-overview-view.js";
import { createDjQueueReorderController } from "./modules/dj-queue-reorder.js";
import { createDjCommandService } from "./modules/dj-command-service.js";
import { createDjSpotifyConsole } from "./modules/dj-spotify-console.js";
import { createDjAiAssistant } from "./modules/dj-ai-assistant.js";
import { createDjAuthController } from "./modules/dj-auth-controller.js";

const loginCard=document.querySelector("#dj-login-card");
const loginForm=document.querySelector("#dj-login-form");
const loginMessage=document.querySelector("#dj-login-message");
const consoleView=document.querySelector("#dj-console");
const requestList=document.querySelector("#dj-requests");
const message=document.querySelector("#dj-message");
let spotifyQueuePreview=null;
let playback;
let polling;
let spotifyConsole;
const auth=createDjAuthController({
  loginCard,loginForm,loginMessage,consoleView,
  onStateChange:enabled=>{
    if(enabled)polling?.start();
    else { polling?.stop(); playback?.invalidate(); spotifyConsole?.invalidate(); }
  },
});
const api=createDjApi(()=>auth.getToken());
const commands=createDjCommandService({api,refresh:()=>refresh(),onMessage:text=>{message.textContent=text;}});
spotifyConsole=createDjSpotifyConsole({api,getPlayback:()=>playback,onMessage:text=>{message.textContent=text;},onQueuePreview:track=>{spotifyQueuePreview=track;}});
playback=createDjPlaybackCoordinator({
  getToken:()=>auth.getToken(),
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
polling=createDjPollingController(refresh,()=>spotifyConsole.refreshStatus());
const queueReorder=createDjQueueReorderController(requestList,order=>commands.saveQueueOrder(order));
const overviewView=createDjOverviewView({
  requestList,
  queueReorder,
  commands,
  spotifyConsole,
  getQueuePreview:()=>spotifyQueuePreview,
});
async function refresh(){
  try{const data=await api("/api/dj/overview");overviewView.render(data);}
  catch(e){if(e.message.toLowerCase().includes("sessie")){auth.logout();return;}message.textContent=e.message;}
}
document.querySelector("#dj-logout").addEventListener("click",()=>auth.logout());
document.querySelector("#pause-toggle").addEventListener("click",()=>commands.updateSetting("requests_paused",!overviewView.getSettings().requestsPaused));
document.querySelector("#approval-toggle").addEventListener("click",()=>commands.updateSetting("auto_approve",!overviewView.getSettings().autoApprove));
document.querySelector("#auto-queue-toggle").addEventListener("click",()=>commands.updateSetting("auto_queue",!overviewView.getSettings().autoQueue));

createDjAiAssistant({api,refresh:()=>refresh()});

bindDjChatGptHandoff({
  button:document.querySelector("#dj-chatgpt-help"),
  output:document.querySelector("#dj-ai-answer"),
});

if(auth.hasToken())auth.setLoggedIn(true);


const nextButton=document.querySelector("#partyqueue-next");
nextButton.addEventListener("click",()=>commands.runNextRequest({
  button:nextButton,
  onTrackStarted:()=>{
    spotifyQueuePreview=null;
    spotifyConsole.setDeck("right",null);
  },
  refreshPlayback:()=>spotifyConsole.refreshStatus(),
}));
