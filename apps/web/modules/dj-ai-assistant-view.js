// DOM-only rendering for the DJ AI assistant. API calls and queue policy stay in the controller.
export function createDjAiAssistantView({ documentRef = document } = {}) {
  function node(tag, className, text) {
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderWorking(output, message) {
    output.textContent = message;
  }

  function renderAdvice(output, answer, cached = false) {
    output.textContent = (cached ? "↻ Eerder advies (wachtrij ongewijzigd)\n\n" : "") + answer;
  }

  function renderQueueProposal(output, { answer, queueLength, onConfirm, onCancel }) {
    output.replaceChildren(node("p", "", answer));
    const panel = node("div", "dj-ai-confirm-panel");
    panel.append(node(
      "p",
      "dj-ai-results-hint",
      "Alle " + queueLength + " nummers zijn herkend. Wil je deze nieuwe volgorde toepassen op UP NEXT?",
    ));
    const confirmButton = node("button", "dj-ai-add", "✓ JA, PAS VOLGORDE TOE");
    confirmButton.type = "button";
    const cancelButton = node("button", "dj-ai-cancel", "ANNULEREN");
    cancelButton.type = "button";

    confirmButton.addEventListener("click", async () => {
      confirmButton.disabled = true;
      cancelButton.disabled = true;
      confirmButton.textContent = "VOLGORDE OPSLAAN…";
      try {
        await onConfirm();
        output.replaceChildren(
          node("p", "", answer),
          node("p", "dj-ai-results-hint", "✓ Wachtrij effectief herschikt. De nieuwe volgorde is opgeslagen."),
        );
      } catch (error) {
        confirmButton.disabled = false;
        cancelButton.disabled = false;
        confirmButton.textContent = "✓ JA, PAS VOLGORDE TOE";
        output.append(node("p", "dj-ai-results-hint", "Opslaan mislukt: " + error.message));
      }
    });

    cancelButton.addEventListener("click", () => {
      onCancel?.();
      output.replaceChildren(
        node("p", "", answer),
        node("p", "dj-ai-results-hint", "Voorstel geannuleerd. Je huidige wachtrij blijft ongewijzigd."),
      );
    });
    panel.append(confirmButton, cancelButton);
    output.append(panel);
  }

  function renderIncompleteQueueProposal(output, answer, matchedCount, totalCount, unmatchedLines) {
    output.textContent = answer + "\n\n⚠️ Ik kon slechts " + matchedCount + " van de " + totalCount
      + " nummers eenduidig koppelen. Er is niets gewijzigd. Niet herkend: "
      + (unmatchedLines.length ? unmatchedLines.join(" | ") : "controleer of de AI alle wachtrijtracks heeft opgenomen.");
  }

  function renderTrackSuggestions(output, { answer, mode, results, onAddSelected }) {
    output.replaceChildren();
    output.append(node("p", "", answer));
    output.append(node(
      "p",
      "dj-ai-results-hint",
      mode === "import"
        ? "Je lijst is herkend. Kies per nummer de juiste Spotify-uitvoering om die rechtstreeks aan UP NEXT toe te voegen."
        : "Spotify-matches — kies de juiste uitvoering om die rechtstreeks aan UP NEXT toe te voegen.",
    ));

    const selectedTracks = [];
    let groupIndex = 0;
    for (const group of results.results || []) {
      const groupBox = node("div", "dj-ai-suggestion");
      groupBox.append(node("strong", "dj-ai-query", group.query));
      if (!group.tracks?.length) groupBox.append(node("span", "dj-ai-no-match", "Geen Spotify-match gevonden."));
      (group.tracks || []).forEach((track, trackIndex) => {
        const option = node("label", "dj-ai-track");
        const pick = documentRef.createElement("input");
        pick.type = "radio";
        pick.name = "dj-ai-pick-" + groupIndex;
        pick.value = track.id;
        pick.checked = trackIndex === 0;
        selectedTracks.push({ track, group: group.query, pick });
        if (track.albumImageUrl) {
          const cover = node("img", "dj-ai-track-cover");
          cover.src = track.albumImageUrl;
          cover.alt = "";
          option.append(cover);
        }
        const details = node("div", "dj-ai-track-details");
        details.append(node("strong", "", track.name), node("span", "", track.artists.join(", ")));
        option.append(pick, details);
        groupBox.append(option);
      });
      output.append(groupBox);
      groupIndex += 1;
    }

    const addSelected = node("button", "dj-ai-add", "＋ VOEG GESELECTEERDE NUMMERS TOE AAN UP NEXT");
    addSelected.type = "button";
    addSelected.addEventListener("click", async () => {
      const chosen = selectedTracks.filter(item => item.pick.checked);
      if (!chosen.length) return;
      addSelected.disabled = true;
      addSelected.textContent = "NUMMERS WORDEN TOEGEVOEGD…";
      const summary = await onAddSelected(chosen);
      addSelected.textContent = summary.added.length + " NUMMERS TOEGEVOEGD";
      const parts = [];
      if (summary.added.length) parts.push(summary.added.length + " nieuw toegevoegd aan UP NEXT");
      if (summary.alreadyQueued.length) parts.push(summary.alreadyQueued.length + " stonden al in de actieve wachtrij en zijn overgeslagen");
      if (!parts.length) parts.push("Geen nieuwe nummers toegevoegd");
      if (summary.failed.length) {
        parts.push("Fouten: " + summary.failed.map(item => item.track.name + ": " + item.error).join("; "));
      }
      output.append(node("p", "dj-ai-results-hint", parts.join(". ") + "."));
    });
    output.append(addSelected);
  }

  function renderNoSuggestions(output, answer) {
    output.replaceChildren(
      node("p", "", answer),
      node("p", "dj-ai-results-hint", "Ik kon geen genummerde tracks uit het antwoord halen. Vraag de AI om een lijst met Titel — Artiest."),
    );
  }

  function appendMemoryUpdated(output) {
    output.append(node("p", "dj-ai-results-hint", "✓ DJ-voorkeur opgeslagen in het geheugen van dit event."));
  }

  function renderError(output, error) {
    output.textContent = error instanceof Error ? error.message : String(error);
  }

  return {
    appendMemoryUpdated,
    renderAdvice,
    renderError,
    renderIncompleteQueueProposal,
    renderNoSuggestions,
    renderQueueProposal,
    renderTrackSuggestions,
    renderWorking,
  };
}
