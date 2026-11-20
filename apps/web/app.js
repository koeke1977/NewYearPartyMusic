import { getSavedSession, saveGuestSession } from "./modules/guest-session.js";
import { showMusicSearch } from "./modules/guest-music-search.js";

const form = document.querySelector("#join-form");
const message = document.querySelector("#form-message");
const submitButton = form?.querySelector('button[type="submit"]');
const card = document.querySelector(".join-card");

const existingSession = getSavedSession();
if (existingSession) showMusicSearch(card, existingSession);

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
    saveGuestSession(session);
    showMusicSearch(card, session);
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "Er ging iets mis. Probeer opnieuw.";
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = 'IK DOE MEE <span aria-hidden="true">↗</span>';
    }
  }
});
