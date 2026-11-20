// Builds a second-opinion prompt using aggregate event context only; Spotify metadata is never transferred.
export function buildDjChatGptPrompt({
  eventName = "New Year's Eve 2026",
  localTime = "",
  requestCounts = {},
  djPreferences = [],
} = {}) {
  const counts = Object.entries(requestCounts || {})
    .map(([status, count]) => status + ": " + Number(count || 0))
    .join(", ") || "geen aanvragen";
  return [
    "Je bent mijn tweede DJ-adviseur voor DJ#DATUUR / PartyQueue, een Oud & Nieuw-feest in België.",
    "Geef advies in het Nederlands. Denk creatief en durf bewust van genre, decennium en energie te wisselen. Forceer geen vloeiende overgangen.",
    "Gebruik alleen de algemene context hieronder. Spotify-trackmetadata, artiesten, albumhoezen, actuele wachtrij en playbackstatus zijn bewust niet meegestuurd. Beweer niet dat je de muziek of het publiek hoort of ziet.",
    "Voeg niets zelf toe aan Spotify of PartyQueue; geef alleen een voorstel dat de DJ zelf kan uitvoeren.",
    "",
    "EVENT: " + eventName,
    "BELGISCHE LOKALE TIJD: " + (localTime || "Niet beschikbaar"),
    "AANTALLEN AANVRAGEN PER STATUS: " + counts,
    "DJ-VOORKEUREN: " + (djPreferences.length ? djPreferences.join(", ") : "creatief, gevarieerd en met bewuste stijlwissels"),
    "",
    "Geef een concreet DJ-advies over energie, genreblokken, decennia, meezingers, rustmomenten en verrassende stijlwissels. Geef geen bestaande trackvolgorde en verzin geen informatie over de live wachtrij."
  ].join("\n");
}

// Opens regular ChatGPT and transfers only aggregate, non-Spotify event context via clipboard.
export function bindDjChatGptHandoff({
  button,
  getOverview,
  getLocalTime = () => new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels", dateStyle: "medium", timeStyle: "short",
  }).format(new Date()),
  output,
  openWindow = (url, target, features) => window.open(url, target, features),
  clipboard = navigator.clipboard,
}) {
  button?.addEventListener("click", async () => {
    const overview = getOverview();
    if (!overview) {
      output.textContent = "De actuele DJ-consolegegevens zijn nog niet geladen. Probeer opnieuw zodra het dashboard zichtbaar is.";
      return;
    }
    const requestCounts = {};
    for (const request of overview.requests || []) {
      requestCounts[request.status] = (requestCounts[request.status] || 0) + 1;
    }
    const prompt = buildDjChatGptPrompt({
      localTime: getLocalTime(),
      requestCounts,
    });
    openWindow("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    button.disabled = true;
    try {
      await clipboard.writeText(prompt);
      output.textContent = "✓ Alleen eventtijd en aantallen (geen Spotify-trackmetadata) zijn gekopieerd. ChatGPT is in een apart tabblad geopend: plak daar de context met Ctrl+V. Dit gebruikt je gewone ChatGPT-account, geen API.";
    } catch (error) {
      output.textContent = "ChatGPT is geopend, maar het kopiëren naar het klembord is geblokkeerd. Fout: " + (error?.message || "onbekend") + ".";
    } finally {
      button.disabled = false;
    }
  });
}
