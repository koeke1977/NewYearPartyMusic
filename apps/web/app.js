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
  title.append(element("h2", "", "Find your track"), element("p", "", "You're in, " + session.guest.nickname + ". What should we play?"));
  top.append(title);
  card.append(top);

  const searchForm = element("form", "search-form");
  searchForm.id = "track-search-form";
  const searchInput = element("input");
  searchInput.type = "search";
  searchInput.name = "query";
  searchInput.placeholder = "Search artist, song or album...";
  searchInput.autocomplete = "off";
  searchInput.minLength = 2;
  searchInput.maxLength = 100;
  searchInput.required = true;
  const searchButton = element("button", "button button-primary", "SEARCH TRACKS ↗");
  searchButton.type = "submit";
  searchForm.append(searchInput, searchButton);
  card.append(searchForm);

  const feedback = element("p", "form-message");
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  card.append(feedback);
  const results = element("div", "track-results");
  results.id = "track-results";
  card.append(results);
  const attribution = element("p", "fine-print", "Music data provided by Spotify");
  card.append(attribution);
  const logout = element("button", "text-button", "Not you? Leave PartyQueue");
  logout.type = "button";
  logout.addEventListener("click", () => {
    localStorage.removeItem("partyqueue_session");
    location.reload();
  });
  card.append(logout);

  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (query.length < 2) return;
    searchButton.disabled = true;
    searchButton.textContent = "SEARCHING...";
    feedback.textContent = "Searching Spotify...";
    results.replaceChildren();
    try {
      const response = await fetch("/api/spotify/search?q=" + encodeURIComponent(query), {
        headers: { Authorization: "Bearer " + session.token },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed.");
      if (!data.tracks.length) {
        feedback.textContent = "No tracks found. Try another search.";
      } else {
        feedback.textContent = data.tracks.length + " tracks found. Pick your favourite.";
        for (const track of data.tracks) {
          const item = element("article", "track-item");
          if (track.albumImageUrl) {
            const image = element("img", "track-cover");
            image.src = track.albumImageUrl;
            image.alt = "Album cover";
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
          const requestButton = element("button", "request-button", "REQUEST");
          requestButton.type = "button";
          requestButton.addEventListener("click", async () => {
            requestButton.disabled = true;
            requestButton.textContent = "SENDING...";
            try {
              const requestResponse = await fetch("/api/requests", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token },
                body: JSON.stringify({ trackId: track.id }),
              });
              const requestData = await requestResponse.json();
              if (!requestResponse.ok) throw new Error(requestData.error || "Request failed.");
              requestButton.textContent = "SENT ✓";
              requestButton.classList.add("request-sent");
              feedback.textContent = "Your request for " + requestData.request.name + " is " +
                (requestData.request.status === "approved" ? "approved and ready for the DJ!" : "waiting for DJ approval.");
            } catch (error) {
              requestButton.disabled = false;
              requestButton.textContent = "REQUEST";
              feedback.textContent = error instanceof Error ? error.message : "Could not send request.";
            }
          });
          item.append(details, requestButton);
          results.append(item);
        }
      }
    } catch (error) {
      feedback.textContent = error instanceof Error ? error.message : "Spotify search is unavailable.";
    } finally {
      searchButton.disabled = false;
      searchButton.textContent = "SEARCH TRACKS ↗";
    }
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
    submitButton.textContent = "ONE MOMENT...";
  }
  message.textContent = "We controleren je toegang...";
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
      submitButton.innerHTML = 'LET ME IN <span aria-hidden="true">↗</span>';
    }
  }
});
