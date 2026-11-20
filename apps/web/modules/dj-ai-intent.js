// Resolves the DJ prompt into the supported assistant interaction modes.
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
      source = previousTracks.join("\n");
      trackLines = previousTracks;
    }
  }

  if (reorderIntent) {
    return {
      mode: "advice",
      prompt: "Geef een creatief DJ-setplan op basis van deze instructie: " + text +
        ". Je ontvangt geen live wachtrij of Spotify-trackmetadata. Beschrijf energieblokken en stijlwissels, maar verzin geen bestaande trackvolgorde.",
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
