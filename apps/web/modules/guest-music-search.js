import { element } from "./dom.js";
import { clearGuestSession } from "./guest-session.js";
import { searchGuestTracks, submitGuestTrackRequest } from "./guest-music-api.js";
import { renderGuestTrackResults } from "./guest-track-results-view.js";
import { renderGuestMusicPreferences } from "./guest-music-preferences.js";

export function showMusicSearch(card, session) {
  if (!card) return;
  card.replaceChildren();
  const top = element("div", "section-heading");
  top.append(element("span", "step", "02"));
  const title = element("div");
  title.append(element("h2", "", "Zoek jouw nummer"), element("p", "", "Welkom, " + session.guest.nickname + "! Welk nummer wil je horen?"));
  top.append(title);
  card.append(top);
  renderGuestMusicPreferences(card, session);

  const searchForm = element("form", "search-form");
  searchForm.id = "track-search-form";
  const searchInput = element("input", "track-search-input");
  searchInput.type = "search";
  searchInput.name = "query";
  searchInput.placeholder = "Zoek op artiest, nummer of een stukje tekst…";
  searchInput.setAttribute("aria-label", "Zoek een nummer of artiest");
  searchInput.autocomplete = "off";
  searchInput.minLength = 2;
  searchInput.maxLength = 100;
  searchInput.required = true;
  const searchLabel = element("label", "search-label", "TYP HIER OM JOUW NUMMER TE ZOEKEN");
  searchLabel.htmlFor = "guest-track-search";
  searchInput.id = "guest-track-search";
  searchInput.placeholder = "Begin hier te typen… bv. Madonna of Like a Prayer";
  searchForm.append(searchLabel, searchInput);
  card.append(searchForm);

  const searchHint = element("p", "search-hint", "Typ een artiest, titel of een stukje tekst. De suggesties verschijnen automatisch.");
  card.append(searchHint);
  const feedback = element("p", "form-message search-feedback");
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  card.append(feedback);
  const results = element("div", "track-results");
  results.id = "track-results";
  card.append(results);
  const attribution = element("p", "fine-print", "Muziekgegevens aangeboden door Spotify");
  card.append(attribution);
  const brandCredit = element("p", "guest-brand-credit");
  brandCredit.append(document.createTextNode("POWERED BY "));
  brandCredit.append(element("strong", "datuur-mark", "#DATUUR"));
  card.append(brandCredit);
  const logout = element("button", "text-button", "Niet jij? Afmelden");
  logout.type = "button";
  logout.addEventListener("click", () => {
    clearGuestSession();
    location.reload();
  });
  card.append(logout);

  let searchTimer = null;
  let activeSearch = null;
  let latestSearch = 0;

  async function submitTrackRequest(track, requestButton) {
    requestButton.disabled = true;
    requestButton.textContent = "BEZIG…";
    try {
      const requestData = await submitGuestTrackRequest(track.id, session.token);
      requestButton.textContent = "AANGEVRAAGD ✓";
      requestButton.classList.add("request-sent");
      feedback.textContent = "Top! " + requestData.request.name + " is " +
        (requestData.request.status === "approved" ? "goedgekeurd en klaar voor de DJ." : "doorgestuurd naar de DJ.");
    } catch (error) {
      requestButton.disabled = false;
      requestButton.textContent = "AANVRAGEN";
      feedback.textContent = error instanceof Error ? error.message : "Aanvragen is niet gelukt.";
    }
  }

  async function runSearch() {
    const query = searchInput.value.trim();
    const searchId = ++latestSearch;
    if (activeSearch) activeSearch.abort();
    if (query.length < 2) {
      results.replaceChildren();
      feedback.textContent = query.length ? "Typ nog één teken om te zoeken…" : "";
      return;
    }
    activeSearch = new AbortController();
    feedback.textContent = "We zoeken even…";
    results.replaceChildren();
    try {
      const data = await searchGuestTracks(query, session.token, activeSearch.signal);
      if (searchId !== latestSearch) return;
      if (!data.tracks.length) {
        feedback.textContent = "Geen resultaat? Probeer alleen de artiest of een korter stukje van de titel.";
        return;
      }
      feedback.textContent = data.tracks.length + " nummers gevonden — tik op jouw keuze.";
      renderGuestTrackResults(results, data.tracks, submitTrackRequest);
    } catch (error) {
      if (error?.name === "AbortError" || searchId !== latestSearch) return;
      feedback.textContent = error instanceof Error ? error.message : "Muziek zoeken is tijdelijk niet beschikbaar.";
    }
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 350);
  });
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    runSearch();
  });
}
