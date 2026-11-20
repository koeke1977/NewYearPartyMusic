// Builds a second-opinion prompt using only event timing and DJ-authored preferences.
export function buildDjChatGptPrompt({
  eventName = "New Year's Eve 2026",
  localTime = "",
  djPreferences = [],
} = {}) {
  return [
    "Je bent mijn tweede DJ-adviseur voor DJ#DATUUR / PartyQueue, een Oud & Nieuw-feest in België.",
    "Geef advies in het Nederlands. Denk creatief en durf bewust van genre, decennium en energie te wisselen. Forceer geen vloeiende overgangen.",
    "Gebruik alleen de algemene context hieronder. Er is geen Spotify-content, requestdata, wachtrij of playbackstatus meegestuurd. Beweer niet dat je de muziek of het publiek hoort of ziet.",
    "Voeg niets zelf toe aan Spotify of PartyQueue; geef alleen een voorstel dat de DJ zelf kan uitvoeren.",
    "",
    "EVENT: " + eventName,
    "BELGISCHE LOKALE TIJD: " + (localTime || "Niet beschikbaar"),
    "DJ-VOORKEUREN: " + (djPreferences.length ? djPreferences.join(", ") : "creatief, gevarieerd en met bewuste stijlwissels"),
    "",
    "Geef een concreet DJ-advies over energie, genreblokken, decennia, meezingers, rustmomenten en verrassende stijlwissels. Geef geen bestaande trackvolgorde en verzin geen informatie over de live wachtrij."
  ].join("\n");
}

// Opens regular ChatGPT and transfers only non-Spotify event context via clipboard.
export function bindDjChatGptHandoff({
  button,
  getLocalTime = () => new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels", dateStyle: "medium", timeStyle: "short",
  }).format(new Date()),
  output,
  openWindow = (url, target, features) => window.open(url, target, features),
  clipboard = navigator.clipboard,
}) {
  button?.addEventListener("click", async () => {
    const prompt = buildDjChatGptPrompt({ localTime: getLocalTime() });
    openWindow("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    button.disabled = true;
    try {
      await clipboard.writeText(prompt);
      output.textContent = "✓ Alleen eventtijd en DJ-voorkeuren (geen Spotify-content of requestdata) zijn gekopieerd. ChatGPT is in een apart tabblad geopend: plak daar de context met Ctrl+V. Dit gebruikt je gewone ChatGPT-account, geen API.";
    } catch (error) {
      output.textContent = "ChatGPT is geopend, maar het kopiëren naar het klembord is geblokkeerd. Fout: " + (error?.message || "onbekend") + ".";
    } finally {
      button.disabled = false;
    }
  });
}
