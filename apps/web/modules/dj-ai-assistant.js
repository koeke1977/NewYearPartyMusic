import { orderedQueued } from "./dj-queue.js";
import { matchDjQueueProposal } from "./dj-ai-queue-parser.js";
import { extractDjTrackSuggestions } from "./dj-ai-suggestions.js";
import { resolveDjAiPrompt } from "./dj-ai-intent.js";
import { addSelectedDjTracks, applyDjQueueProposal } from "./dj-ai-actions.js";
import { element as el } from "./dom.js";

// Owns DJ#DATUUR AI prompt submission, proposal confirmation and Spotify suggestion UI.
export function createDjAiAssistant({ api, refresh, documentRef = document }) {
  const aiForm=documentRef.querySelector("#dj-ai-form");
  async function askDJAI(prompt,mode="advice"){
    const input=documentRef.querySelector("#dj-ai-prompt");
    const button=documentRef.querySelector("#dj-ai-submit");
    const output=documentRef.querySelector("#dj-ai-answer");
    const actionButtons=[...documentRef.querySelectorAll("[data-ai-action]")];
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
        const proposal = await applyDjQueueProposal({
          proposedIds: ids, queuedIds: queued.map(track => track.id),
          saveOrder: async () => {},
        });
        if(proposal.applied || (queued.length && ids.length===queued.length && new Set(ids).size===queued.length)){
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
              await applyDjQueueProposal({
                proposedIds: ids, queuedIds: queued.map(track => track.id),
                saveOrder: order => api("/api/dj/queue/reorder",{method:"POST",body:JSON.stringify({order})}),
              });
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
              const pick=documentRef.createElement("input");
              pick.type="radio";pick.name="dj-ai-pick-"+groupIndex;pick.value=track.id;
              pick.checked=trackIndex===0;
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
            const summary=await addSelectedDjTracks({
              tracks:chosen,
              addTrack:item=>api("/api/dj/ai/music/add",{method:"POST",body:JSON.stringify({trackId:item.track.id})}),
            });
            await refresh();
            addSelected.textContent=summary.added.length+" NUMMERS TOEGEVOEGD";
            const parts=[];
            if(summary.added.length)parts.push(summary.added.length+" nieuw toegevoegd aan UP NEXT");
            if(summary.alreadyQueued.length)parts.push(summary.alreadyQueued.length+" stonden al in de actieve wachtrij en zijn overgeslagen");
            if(!parts.length)parts.push("Geen nieuwe nummers toegevoegd");
            if(summary.failed.length)parts.push("Fouten: "+summary.failed.map(item=>item.track.name+": "+item.error).join("; "));
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
    const prompt=documentRef.querySelector("#dj-ai-prompt").value.trim();
    if(prompt){
      const output=documentRef.querySelector("#dj-ai-answer");
      const resolved=resolveDjAiPrompt(prompt,output.innerText||output.textContent||"");
      if(resolved)await askDJAI(resolved.prompt,resolved.mode);
    }
  });
  documentRef.querySelectorAll("[data-ai-action]").forEach(button=>button.addEventListener("click",async()=>{
    const action=button.dataset.aiAction;
    if(action==="optimize"){
      await askDJAI("Optimaliseer de volledige huidige PartyQueue wachtrij als een creatieve DJ-set. Je mag bewust van stijl, genre, tempo en decennium veranderen: zet gerust een herkenbaar 90s-blok tussen ballades, bouw disco/dance-blokken of maak een onverwachte energieboost. Forceer geen vloeiende overgangen en behoud niet automatisch de huidige stijl. Gebruik de volledige tracklijst exact één keer per nummer; voeg geen tracks toe en laat er geen weg. Geef ALLEEN een genummerde lijst in het formaat Titel — Artiest, zonder intro of uitleg. Als er minder dan twee tracks zijn, zeg dat.","optimize");
    }else if(action==="starter"){
      await askDJAI("Maak een gevarieerde basisselectie van 12 bekende, feestgeschikte nummers voor een Oud & Nieuw-feest in België. Bouw op van warm-up naar dansvloer en meezingers. Geef een genummerde lijst met exact Titel — Artiest en vermeld kort waarom de set werkt.","starter");
    }else{
      await askDJAI("Stel 8 externe nummers voor die goed aansluiten op de huidige PartyQueue wachtrij en de energie geleidelijk verhogen richting een Oud & Nieuw-feest. Vermijd artiesten en tracks die al in UP NEXT of recent gespeeld staan. Geef een genummerde lijst met exact Titel — Artiest en markeer dit als suggesties buiten de wachtrij.","fill");
    }
  }));
  return { ask: askDJAI };
}
