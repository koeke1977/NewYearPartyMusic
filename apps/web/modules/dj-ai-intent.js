// Resolves the DJ prompt into the existing assistant interaction modes.
const TRACK_LINE = /^\s*\d+[.)]\s*.+\s+[—–-]\s+.+/;

function extractTrackLines(value) {
  return String(value || "").split(/\r?\n/).filter(line => TRACK_LINE.test(line));
}

export function resolveDjAiPrompt(prompt, previousAnswer = "") {
  const text = String(prompt || "").trim();
  if (!text) return null;

  const importIntent = /\b(zet|voeg|importeer|plaats)\b[\s\S]{0,100}\b(lijst|muzieklijst|nummers|tracks|wachtrij|up\s*next)\b/i.test(text);
  const reorderIntent = /\b(optimaliseer|herschik|herorden|verplaats|zet)\b/i.test(text)
    && /\b(wachtrij|up\s*next|volgorde|blok|tussen|ballades|stijl|genre|jaren|90s|80s|70s)\b/i.test(text);

  let source = text;
  let trackLines = extractTrackLines(source);
  if (importIntent && trackLines.length === 0) {
    const previousTracks = extractTrackLines(previousAnswer);
    if (previousTracks.length >= 2) {
      // Use real line breaks so the assistant receives a parseable numbered list.
      source = previousTracks.join("\n");
      trackLines = previousTracks;
    }
  }

  if (reorderIntent) {
    return {
      mode: "optimize",
      prompt: "Pas deze DJ-instructie toe op de volledige huidige UP NEXT-wachtrij: " + text + ". Geef ALLEEN een genummerde lijst met alle bestaande tracks exact één keer, geen nummers toevoegen of weglaten.",
    };
  }

  if (importIntent && trackLines.length > 0) return { mode: "import", prompt: source };
  if (importIntent) {
    return {
      mode: "fill",
      prompt: "De DJ wil deze specifieke track(s) toevoegen aan UP NEXT. Geef alleen de gevraagde track(s) als genummerde lijst in exact het formaat Titel — Artiest. Voeg geen andere suggesties toe. Verzoek: " + text,
    };
  }

  return { mode: "advice", prompt: source };
}
