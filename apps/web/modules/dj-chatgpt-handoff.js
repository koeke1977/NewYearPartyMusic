import { orderedQueued } from "./dj-queue.js";

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

 
// Owns opening the regular ChatGPT tab and transferring the live DJ context via clipboard.
export function bindDjChatGptHandoff({
  button,
  getOverview,
  getNowPlaying,
  output,
  openWindow = (url, target, features) => window.open(url, target, features),
  clipboard = navigator.clipboard,
}) {
  button?.addEventListener("click", async () => {
    const overview = getOverview();
    if (!overview) {
      output.textContent = "De actuele DJ-consolegegevens zijn nog niet geladen. Probeer opnieuw zodra UP NEXT zichtbaar is.";
      return;
    }
    const queued = orderedQueued(overview.requests || [], overview.queueOrder || []);
    const prompt = buildDjChatGptPrompt({ queuedTracks: queued, nowPlaying: getNowPlaying() });
    openWindow("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    button.disabled = true;
    try {
      await clipboard.writeText(prompt);
      output.textContent = "✓ De actuele UP NEXT-lijst en Spotify-status zijn gekopieerd. ChatGPT is in een apart tabblad geopend: plak daar de context met Ctrl+V. Dit gebruikt je gewone ChatGPT-account, geen API.";
    } catch (error) {
      output.textContent = "ChatGPT is geopend, maar het kopiëren naar het klembord is geblokkeerd. Fout: " + (error?.message || "onbekend") + ".";
    } finally {
      button.disabled = false;
    }
  });
}
