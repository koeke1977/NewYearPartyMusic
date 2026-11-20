// Builds the live DJ context copied into a regular ChatGPT conversation.
export function buildDjChatGptPrompt({ queuedTracks = [], nowPlaying = "Niet beschikbaar" } = {}) {
  const tracks = Array.isArray(queuedTracks) ? queuedTracks : [];
  const queueText = tracks.length
    ? tracks.map((track, index) => (index + 1) + ". " + track.track_name + " — " + track.artist_name).join("\n")
    : "(UP NEXT is momenteel leeg)";

  return [
    "Je bent mijn tweede DJ-adviseur voor DJ#DATUUR / PartyQueue, een Oud & Nieuw-feest in België.",
    "Geef advies in het Nederlands. Denk creatief en durf bewust van genre, decennium en energie te wisselen. Forceer geen vloeiende overgangen.",
    "Gebruik de live context hieronder. Beweer niet dat je de muziek of het publiek hoort of ziet. Voeg niets zelf toe aan Spotify of PartyQueue; geef alleen een voorstel dat ik zelf kan uitvoeren.",
    "",
    "MOMENTEEL OP SPOTIFY:",
    String(nowPlaying || "Niet beschikbaar").trim(),
    "",
    "UP NEXT (" + tracks.length + " tracks):",
    queueText,
    "",
    "Geef een concreet DJ-advies op basis van deze huidige set. Benoem eventuele zwakke plekken en geef bruikbare alternatieven. Bewaar alle bestaande tracks wanneer je een nieuwe volgorde voorstelt."
  ].join("\n");
}
