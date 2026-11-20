import { orderedQueued } from "./dj-queue.js";
import { matchDjQueueProposal } from "./dj-ai-queue-parser.js";
import { extractDjTrackSuggestions } from "./dj-ai-suggestions.js";
import { resolveDjAiPrompt } from "./dj-ai-intent.js";
import { addSelectedDjTracks, applyDjQueueProposal, isCompleteDjQueueProposal } from "./dj-ai-actions.js";
import { createDjAiAssistantView } from "./dj-ai-assistant-view.js";

// Owns DJ#DATUUR AI request orchestration, queue policy and API calls.
export function createDjAiAssistant({ api, refresh, documentRef = document }) {
  const aiForm = documentRef.querySelector("#dj-ai-form");
  const view = createDjAiAssistantView({ documentRef });

  async function askDJAI(prompt, mode = "advice") {
    const input = documentRef.querySelector("#dj-ai-prompt");
    const button = documentRef.querySelector("#dj-ai-submit");
    const output = documentRef.querySelector("#dj-ai-answer");
    const actionButtons = [...documentRef.querySelectorAll("[data-ai-action]")];
    button.disabled = true;
    actionButtons.forEach(item => item.disabled = true);
    view.renderWorking(output, "DJ#DATUUR AI denkt even mee…");

    try {
      const result = mode === "import"
        ? { answer: prompt, cached: false }
        : await api("/api/dj/ai/assistant", { method: "POST", body: JSON.stringify({ prompt }) });
      const answer = result.answer || "Geen advies ontvangen.";
      if (mode === "advice" && result.spotifyMatches?.length) mode = "fill";

      if (mode === "optimize") {
        view.renderWorking(output, answer + "\n\nWachtrij wordt gecontroleerd…");
        const overview = await api("/api/dj/overview");
        const queued = orderedQueued(overview.requests || [], overview.queueOrder || []);
        const { ids, unmatchedLines } = matchDjQueueProposal(answer, queued);
        const queuedIds = queued.map(track => track.id);
        if (isCompleteDjQueueProposal(ids, queuedIds)) {
          view.renderQueueProposal(output, {
            answer,
            queueLength: queued.length,
            onConfirm: async () => {
              await applyDjQueueProposal({
                proposedIds: ids,
                queuedIds,
                saveOrder: order => api("/api/dj/queue/reorder", { method: "POST", body: JSON.stringify({ order }) }),
              });
              await refresh();
            },
          });
        } else {
          view.renderIncompleteQueueProposal(output, answer, ids.length, queued.length, unmatchedLines);
        }
      } else if (mode === "starter" || mode === "fill" || mode === "import") {
        const suggestions = extractDjTrackSuggestions(answer, result.spotifyMatches);
        if (!suggestions.length) {
          view.renderNoSuggestions(output, answer);
        } else {
          const results = result.spotifyMatches?.length
            ? { results: result.spotifyMatches }
            : await api("/api/dj/ai/music/search", { method: "POST", body: JSON.stringify({ queries: suggestions }) });
          view.renderTrackSuggestions(output, {
            answer,
            mode,
            results,
            onAddSelected: async chosen => {
              const summary = await addSelectedDjTracks({
                tracks: chosen,
                addTrack: item => api("/api/dj/ai/music/add", {
                  method: "POST",
                  body: JSON.stringify({ trackId: item.track.id }),
                }),
              });
              await refresh();
              return summary;
            },
          });
        }
      } else {
        view.renderAdvice(output, answer, result.cached);
      }

      if (result.memoryUpdated) view.appendMemoryUpdated(output);
      input.value = "";
    } catch (error) {
      view.renderError(output, error);
    } finally {
      button.disabled = false;
      actionButtons.forEach(item => item.disabled = false);
    }
  }

  aiForm.addEventListener("submit", async event => {
    event.preventDefault();
    const prompt = documentRef.querySelector("#dj-ai-prompt").value.trim();
    if (!prompt) return;
    const output = documentRef.querySelector("#dj-ai-answer");
    const resolved = resolveDjAiPrompt(prompt, output.innerText || output.textContent || "");
    if (resolved) await askDJAI(resolved.prompt, resolved.mode);
  });

  documentRef.querySelectorAll("[data-ai-action]").forEach(button => button.addEventListener("click", async () => {
    const action = button.dataset.aiAction;
    if (action === "optimize") {
      await askDJAI("Optimaliseer de volledige huidige PartyQueue wachtrij als een creatieve DJ-set. Je mag bewust van stijl, genre, tempo en decennium veranderen: zet gerust een herkenbaar 90s-blok tussen ballades, bouw disco/dance-blokken of maak een onverwachte energieboost. Forceer geen vloeiende overgangen en behoud niet automatisch de huidige stijl. Gebruik de volledige tracklijst exact één keer per nummer; voeg geen tracks toe en laat er geen weg. Geef ALLEEN een genummerde lijst in het formaat Titel — Artiest, zonder intro of uitleg. Als er minder dan twee tracks zijn, zeg dat.", "optimize");
    } else if (action === "starter") {
      await askDJAI("Maak een gevarieerde basisselectie van 12 bekende, feestgeschikte nummers voor een Oud & Nieuw-feest in België. Bouw op van warm-up naar dansvloer en meezingers. Geef een genummerde lijst met exact Titel — Artiest en vermeld kort waarom de set werkt.", "starter");
    } else {
      await askDJAI("Stel 8 externe nummers voor die goed aansluiten op de huidige PartyQueue wachtrij en de energie geleidelijk verhogen richting een Oud & Nieuw-feest. Vermijd artiesten en tracks die al in UP NEXT of recent gespeeld staan. Geef een genummerde lijst met exact Titel — Artiest en markeer dit als suggesties buiten de wachtrij.", "fill");
    }
  }));

  return { ask: askDJAI };
}
