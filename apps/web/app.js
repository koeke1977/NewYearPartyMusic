const form = document.querySelector("#join-form");
const message = document.querySelector("#form-message");
const submitButton = form?.querySelector('button[type="submit"]');
const card = document.querySelector(".join-card");

function getSavedSession() {
  try {
    const saved = JSON.parse(localStorage.getItem("partyqueue_session") || "null");
    if (saved?.token && saved?.guest?.nickname && saved.expiresAt > Math.floor(Date.now() / 1000)) return saved;
  } catch {}
  localStorage.removeItem("partyqueue_session");
  return null;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showMusicSearch(session) {
  if (!card) return;
  card.replaceChildren();
  const top = element("div", "section-heading");
  top.append(element("span", "step", "02"));
  const title = element("div");
  title.append(element("h2", "", "Zoek jouw nummer"), element("p", "", "Welkom, " + session.guest.nickname + "! Welk nummer wil je horen?"));
  top.append(title);
  card.append(top);

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
    localStorage.removeItem("partyqueue_session");
    location.reload();
  });
  card.append(logout);

  let searchTimer = null;
  let activeSearch = null;
  let latestSearch = 0;

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
      const response = await fetch("/api/spotify/search?q=" + encodeURIComponent(query), {
        headers: { Authorization: "Bearer " + session.token },
        signal: activeSearch.signal,
      });
      const data = await response.json();
      if (searchId !== latestSearch) return;
      if (!response.ok) throw new Error(data.error || "Zoeken is niet gelukt.");
      if (!data.tracks.length) {
        feedback.textContent = "Geen resultaat? Probeer alleen de artiest of een korter stukje van de titel.";
        return;
      }
      feedback.textContent = data.tracks.length + " nummers gevonden — tik op jouw keuze.";
      for (const track of data.tracks) {
        const item = element("article", "track-item");
        if (track.albumImageUrl) {
          const image = element("img", "track-cover");
          image.src = track.albumImageUrl;
          image.alt = "Albumcover";
          image.loading = "lazy";
          item.append(image);
        } else {
          item.append(element("div", "track-cover track-cover-empty", "♪"));
        }
        const details = element("div", "track-details");
        details.append(element("strong", "track-name", track.name));
        details.append(element("span", "track-artist", track.artists.join(", ")));
        const duration = Math.floor(track.durationMs / 60000) + ":" + String(Math.floor(track.durationMs / 1000) % 60).padStart(2, "0");
        details.append(element("span", "track-duration", duration));
        const requestButton = element("button", "request-button", "AANVRAGEN");
        requestButton.type = "button";
        requestButton.addEventListener("click", async () => {
          requestButton.disabled = true;
          requestButton.textContent = "BEZIG…";
          try {
            const requestResponse = await fetch("/api/requests", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token },
              body: JSON.stringify({ trackId: track.id }),
            });
            const requestData = await requestResponse.json();
            if (!requestResponse.ok) throw new Error(requestData.error || "Aanvragen is niet gelukt.");
            requestButton.textContent = "AANGEVRAAGD ✓";
            requestButton.classList.add("request-sent");
            feedback.textContent = "Top! " + requestData.request.name + " is " +
              (requestData.request.status === "approved" ? "goedgekeurd en klaar voor de DJ." : "doorgestuurd naar de DJ.");
          } catch (error) {
            requestButton.disabled = false;
            requestButton.textContent = "AANVRAGEN";
            feedback.textContent = error instanceof Error ? error.message : "Aanvragen is niet gelukt.";
          }
        });
        item.append(details, requestButton);
        results.append(item);
      }
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

const existingSession = getSavedSession();
if (existingSession) showMusicSearch(existingSession);

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const nickname = String(data.get("nickname") || "").trim();
  const eventCode = String(data.get("eventCode") || "").trim();
  if (nickname.length < 2 || nickname.length > 24 || !eventCode) {
    message.textContent = "Vul een nickname (2–24 tekens) en de feestcode in.";
    return;
  }
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "EVEN GEDULD…";
  }
  message.textContent = "We controleren je feestcode…";
  try {
    const response = await fetch("/api/guests/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, eventCode }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Inloggen is niet gelukt. Probeer opnieuw.");
    const session = { token: result.sessionToken, guest: result.guest, expiresAt: result.expiresAt };
    localStorage.setItem("partyqueue_session", JSON.stringify(session));
    showMusicSearch(session);
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "Er ging iets mis. Probeer opnieuw.";
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = 'IK DOE MEE <span aria-hidden="true">↗</span>';
    }
  }
});
