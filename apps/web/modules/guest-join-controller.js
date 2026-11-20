// Owns guest join form validation, API submission and session handoff.
export function createGuestJoinController({
  form,
  message,
  card,
  submitButton,
  showMusicSearch,
  saveGuestSession,
  fetchImpl = fetch,
  FormDataCtor = FormData,
}) {
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormDataCtor(form);
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
      const response = await fetchImpl("/api/guests/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, eventCode }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Inloggen is niet gelukt. Probeer opnieuw.");

      const session = {
        token: result.sessionToken,
        guest: result.guest,
        expiresAt: result.expiresAt,
      };
      saveGuestSession(session);
      showMusicSearch(card, session);
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : "Er ging iets mis. Probeer opnieuw.";
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "IK DOE MEE ↗";
      }
    }
  });
}
