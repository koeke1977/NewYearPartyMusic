import { extractDjTrackSuggestions } from "./dj-ai-suggestions.js";
import { resolveDjAiPrompt } from "./dj-ai-intent.js";
import { addSelectedDjTracks } from "./dj-ai-actions.js";
import { createDjAiAssistantView } from "./dj-ai-assistant-view.js";

// Owns DJ#DATUUR AI request orchestration and the explicit DJ-selected Spotify search/add flow.
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

      if (mode === "starter" || mode === "fill" || mode === "import") {
        const suggestions = extractDjTrackSuggestions(answer);
        if (!suggestions.length) {
          view.renderNoSuggestions(output, answer);
        } else {
          // Spotify search happens separately after AI returns; results are never sent back to AI.
          const results = await api("/api/dj/ai/music/search", {
            method: "POST",
            body: JSON.stringify({ queries: suggestions }),
          });
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
    if (action === "plan") {
      await askDJAI("Maak een creatief DJ-setplan voor een Oud & Nieuw-feest in België. Denk in energieblokken, genres, decennia, meezingers, rustmomenten en verrassende stijlwissels. Geef advies op basis van algemene DJ-kennis; je ziet de actuele Spotify-wachtrij niet en mag geen bestaande queuevolgorde verzinnen.", "advice");
    } else if (action === "starter") {
      await askDJAI("Maak een gevarieerde basisselectie van 12 bekende, feestgeschikte nummers voor een Oud & Nieuw-feest in België. Bouw op van warm-up naar dansvloer en meezingers. Geef een genummerde lijst met exact Titel — Artiest en vermeld kort waarom de set werkt. Dit zijn ongeverifieerde suggesties.", "starter");
    } else {
      await askDJAI("Stel 8 bekende feestnummers voor voor de volgende fase van een Oud & Nieuw-feest. Wissel bewust van stijl, genre en decennium en bouw de energie op. Geef een genummerde lijst met exact Titel — Artiest. Dit zijn ongeverifieerde suggesties; vermijd claims over de actuele wachtrij.", "fill");
    }
  }));

  return { ask: askDJAI };
}
