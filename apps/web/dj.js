const loginCard=document.querySelector("#dj-login-card");
const loginForm=document.querySelector("#dj-login-form");
const loginMessage=document.querySelector("#dj-login-message");
const consoleView=document.querySelector("#dj-console");
const requestList=document.querySelector("#dj-requests");
const message=document.querySelector("#dj-message");
let token=localStorage.getItem("partyqueue_dj_token")||"";
let pollHandle=null;
let currentSettings={requestsPaused:false,autoApprove:true};
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
function stat(label,value){const box=el("div","dj-stat");box.append(el("span","dj-muted",label),el("strong","",String(value)));return box;}
function addCover(parent,url,cls){if(!url)return;const img=el("img",cls);img.src=url;img.alt="Album artwork";img.loading="lazy";parent.append(img);}
function trackLine(r,index){
  const row=el("div","queue-track");row.append(el("span","queue-position",String(index+1).padStart(2,"0")));addCover(row,r.album_image_url,"");
  const info=el("div","queue-track-info");info.append(el("strong","",r.track_name),el("span","",r.artist_name));row.append(info,row.appendChild(el("span","queue-state","QUEUED")));return row;
}
function renderDeck(requests){
  const queued=requests.filter(r=>r.status==="queued");
  const approved=requests.filter(r=>r.status==="approved");
  const next=queued[0]||approved[0]||null;
  const deck=document.querySelector("#now-playing");deck.replaceChildren();
  if(next){
    addCover(deck,next.album_image_url,"deck-art");
    const info=el("div","");
    info.append(el("p","deck-kicker",next.status==="queued"?"NEXT UP · IN THE MIX":"APPROVED · READY TO CUE"),el("h3","",next.track_name),el("p","dj-muted",next.artist_name),el("p","queue-state", "REQUESTED BY "+(next.nickname||"GUEST").toUpperCase()));
    deck.append(info);
  }else{
    const vinyl=el("div","vinyl-disc");vinyl.append(el("span","","ＰＱ"));
    const info=el("div","");info.append(el("p","deck-kicker","READY FOR THE NEXT DROP"),el("h3","","No track selected"),el("p","dj-muted","Approve a request and send it to the queue."));
    deck.append(vinyl,info);
  }
  const list=document.querySelector("#up-next");list.replaceChildren();
  const upcoming=queued.slice(0,5);
  document.querySelector("#queue-total").textContent=queued.length+" TRACKS";
  if(!upcoming.length){list.append(el("p","dj-empty","The queue is waiting for its first track."));return;}
  upcoming.forEach((r,i)=>list.append(trackLine(r,i)));
}
function render(data){
  currentSettings=data.settings||currentSettings;
  document.querySelector("#pause-state").textContent=currentSettings.requestsPaused?"PAUSED":"ACCEPTING";
  document.querySelector("#approval-state").textContent=currentSettings.autoApprove?"AUTO-APPROVE":"DJ APPROVAL";
  const requests=data.requests||[];
  const count=(s)=>requests.filter(r=>r.status===s).length;
  const stats=document.querySelector("#dj-stats");stats.replaceChildren(
    stat("WAITING",count("pending")),stat("APPROVED",count("approved")),stat("IN QUEUE",count("queued")),stat("PLAYED",count("played"))
  );
  renderDeck(requests);
  document.querySelector("#request-count").textContent=requests.length+" REQUESTS";
  document.querySelector("#last-updated").textContent="SYNCED "+new Date().toLocaleTimeString();
  requestList.replaceChildren();
  const live=requests.filter(r=>["pending","approved","queued"].includes(r.status));
  if(!live.length){requestList.append(el("p","dj-empty","No incoming requests. The dancefloor is waiting…"));return;}
  for(const r of live){
    const card=el("article","dj-request");
    addCover(card,r.album_image_url,"dj-cover");
    const info=el("div","dj-track");
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

async function refreshSpotify(){
  const state=document.querySelector("#spotify-connection-state");
  const device=document.querySelector("#spotify-device");
  const now=document.querySelector("#spotify-now-playing");
  try{
    const data=await api("/api/dj/spotify/status");
    state.textContent=data.connected?"CONNECTED":"NOT CONNECTED";
    state.classList.toggle("accent",!!data.connected);
    if(data.device)device.textContent="ACTIVE DEVICE · "+data.device.name+" ("+data.device.type+")";
    else device.textContent="Spotify is connected. Open Spotify on a device to make it active.";
    now.textContent=data.track?(data.playing?"▶ NOW PLAYING · ":"Ⅱ PAUSED · ")+data.track.name+" — "+data.track.artists.join(", "):"No track is currently playing.";
  }catch(e){
    state.textContent="NOT CONNECTED";
    device.textContent=e.message;
    now.textContent="Connect your Spotify account to enable live playback.";
  }
}
document.querySelector("#spotify-connect").addEventListener("click",async()=>{
  const button=document.querySelector("#spotify-connect");button.disabled=true;message.textContent="Opening Spotify authorization…";
  try{const data=await api("/api/dj/spotify/connect",{method:"POST"});window.location.href=data.url;}
  catch(e){message.textContent=e.message;button.disabled=false;}
});
document.querySelectorAll("[data-spotify-command]").forEach(button=>button.addEventListener("click",async()=>{
  const action=button.dataset.spotifyCommand;button.disabled=true;
  try{await api("/api/dj/spotify/"+action,{method:"POST"});message.textContent="Spotify command sent.";await refreshSpotify();}
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
    message.textContent="Now playing PartyQueue request: "+result.track.name+" — "+result.track.artist;
    await refresh();
    await refreshSpotify();
  }catch(e){
    message.textContent=e.message;
  }finally{
    button.disabled=false;
  }
});
