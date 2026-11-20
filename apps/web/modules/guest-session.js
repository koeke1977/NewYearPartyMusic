export function getSavedSession() {
  try {
    const saved = JSON.parse(localStorage.getItem("partyqueue_session") || "null");
    if (saved?.token && saved?.guest?.nickname && saved.expiresAt > Math.floor(Date.now() / 1000)) return saved;
  } catch {}
  localStorage.removeItem("partyqueue_session");
  return null;
}

export function saveGuestSession(session) {
  localStorage.setItem("partyqueue_session", JSON.stringify(session));
}
