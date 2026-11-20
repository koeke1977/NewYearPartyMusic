import { createGuestJoinController } from "./modules/guest-join-controller.js";
import { getSavedSession, saveGuestSession } from "./modules/guest-session.js";
import { showMusicSearch } from "./modules/guest-music-search.js";

const form = document.querySelector("#join-form");
const card = document.querySelector(".join-card");

const existingSession = getSavedSession();
if (existingSession) showMusicSearch(card, existingSession);

createGuestJoinController({
  form,
  message: document.querySelector("#form-message"),
  card,
  submitButton: form?.querySelector('button[type="submit"]'),
  showMusicSearch,
  saveGuestSession,
});
