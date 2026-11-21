// Resolves DJ prompts into explicit assistant interaction modes.
const TRACK_LINE = /^\s*\d+[.)]\s*.+\s+[—–-]\s+.+/;

function extractTrackLines(value) {
  return String(value || "").split(/\r?\n/).filter(line => TRACK_LINE.test(line));
}

function isExplicitReorderIntent(text) {
  return /\b(optimaliseer|herschik|herorden|herordeneer|sorteer|shuffle)\b/i.test(text)
    || /\b(andere|omgekeerde|nieuwe)\s+volgorde\b/i.test(text);
}

function isImportIntent(text) {
  const hasQueueDestination = /\b(up\s*next|wachtrij|queue)\b/i.test(text);
  const hasAddAction = /\b(zet|voeg|importeer|plaats|steek)\b/i.test(text);
  const hasTrackReference = /\b(die|deze|de\s+volledige|volledige\s+lijst|lijst|muzieklijst|nummers|tracks|allemaal|alles)\b/i.test(text);
  return hasQueueDestination && hasAddAction && hasTrackReference;
}

export function resolveDjAiPrompt(prompt, previousAnswer = "") {
  const text = String(prompt || "").trim();
  if (!text) return null;

  // A genuine reorder request must be explicit. "Zet die in UP NEXT" is an
  // import action, not a request to reorder the active queue.
  if (isExplicitReorderIntent(text)) {
    return {
      mode: "optimize",
      prompt: "Pas deze DJ-instructie toe op de volledige huidige UP NEXT-wachtrij: " + text + ". Geef ALLEEN een genummerde lijst met alle bestaande tracks exact één keer, geen nummers toevoegen of weglaten.",
    };
  }

  if (isImportIntent(text)) {
    const requestedTracks = extractTrackLines(text);
    const previousTracks = requestedTracks.length ? [] : extractTrackLines(previousAnswer);
    const trackLines = requestedTracks.length ? requestedTracks : previousTracks;

    if (trackLines.length) {
      // Preserve the numbered source list; the Spotify search step resolves
      // each item independently and the DJ explicitly triggers the add action.
      return { mode: "import", prompt: trackLines.join("\n") };
    }

    return {
      mode: "fill",
      prompt: "De DJ wil deze specifieke track(s) toevoegen aan UP NEXT. Geef alleen de gevraagde track(s) als genummerde lijst in exact het formaat Titel — Artiest. Voeg geen andere suggesties toe. Verzoek: " + text,
    };
  }

  return { mode: "advice", prompt: text };
}
