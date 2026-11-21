import { extractDjTrackSuggestions } from "./dj-ai-suggestions.js";
import { resolveDjAiPrompt } from "./dj-ai-intent.js";
import { addSelectedDjTracks } from "./dj-ai-actions.js";
import { createDjAiAssistantView } from "./dj-ai-assistant-view.js";
import { getOrCreateDjAiSessionId } from "./dj-ai-session.js";

// Owns DJ#DATUUR AI request orchestration and the explicit DJ-selected Spotify search/add flow.
export function createDjAiAssistant({ api, refresh, documentRef = document, getSessionId = getOrCreateDjAiSessionId }) {
  const aiForm = documentRef.querySelector("#dj-ai-form");
  const view = createDjAiAssistantView({ documentRef });
  const sessionId = getSessionId();
  let previousAssistantAnswer = "";

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
        : await api("/api/dj/ai/assistant", {
          method: "POST",
          body: JSON.stringify({ prompt, sessionId }),
          timeoutMs: 110000,
        });
      const answer = result.answer || "Geen advies ontvangen.";
      previousAssistantAnswer = answer;

      if (mode === "starter" || mode === "fill" || mode === "import") {
        const suggestions = extractDjTrackSuggestions(answer);
        if (!suggestions.length) {
          view.renderNoSuggestions(output, answer);
        } else {
          // Spotify search happens separately after AI returns; results are never sent back to AI.
          const results = await api("/api/dj/ai/music/search", {
            method: "POST",
            body: JSON.stringify({ queries: suggestions }),
            timeoutMs: 30000,
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

      if (mode !== "import") {
        if (result.conversationSaved) view.appendConversationSaved(output);
        else view.appendConversationWarning(output);
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
    const resolved = resolveDjAiPrompt(prompt, previousAssistantAnswer);
    if (resolved) await askDJAI(resolved.prompt, resolved.mode);
  });

  documentRef.querySelectorAll("[data-ai-action]").forEach(button => button.addEventListener("click", async () => {
    const action = button.dataset.aiAction;
    if (action === "plan") {
      await askDJAI(
        "Maak een persoonlijk DJ-setplan voor dit Belgische Oud & Nieuw-feest. Gebruik de meegeleverde LIVE PARTY CONTEXT actief: vertrek vanuit PartyQueue en volgorde, vermijd recent gespeelde tracks, verwerk geaggregeerde publieksvoorkeuren en eventfase/tijd. Benoem kort wat data tonen en ontbreekt. Maak 4–6 opeenvolgende energieblokken met doel, vibe/genre, energie, concrete PartyQueue-trackankers en verrassende stijl-/decenniumwissels. Onderscheid queue-tracks van nieuwe, ongeverifieerde ideeën. Verzin geen data of Spotify-status. PartyQueue is niet hetzelfde als Spotify UP NEXT.",
        "advice",
      );
    } else if (action === "starter") {
      await askDJAI("Maak een gevarieerde basisselectie van 12 bekende, feestgeschikte nummers voor een Oud & Nieuw-feest in België. Bouw op van warm-up naar dansvloer en meezingers. Geef een genummerde lijst met exact Titel — Artiest en vermeld kort waarom de set werkt. Dit zijn ongeverifieerde suggesties.", "starter");
    } else {
      await askDJAI("Stel 8 bekende feestnummers voor voor de volgende fase van een Oud & Nieuw-feest. Wissel bewust van stijl, genre en decennium en bouw de energie op. Geef een genummerde lijst met exact Titel — Artiest. Dit zijn ongeverifieerde suggesties; vermijd claims over de actuele wachtrij.", "fill");
    }
  }));

  return { ask: askDJAI };
}
