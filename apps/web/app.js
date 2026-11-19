const form = document.querySelector("#join-form");
const message = document.querySelector("#form-message");
const submitButton = form?.querySelector('button[type="submit"]');

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

    if (!response.ok) {
      throw new Error(result.error || "Inloggen is niet gelukt. Probeer opnieuw.");
    }

    localStorage.setItem("partyqueue_session", JSON.stringify({
      token: result.sessionToken,
      guest: result.guest,
      expiresAt: result.expiresAt,
    }));

    const card = document.querySelector(".join-card");
    if (card) {
      const heading = document.createElement("h2");
      heading.textContent = "You're in, " + result.guest.nickname + "!";
      const description = document.createElement("p");
      description.textContent = "Je bent aangemeld bij PartyQueue. De muziekzoeker komt eraan.";
      const status = document.createElement("p");
      status.className = "form-message";
      status.textContent = "Je toegang is bevestigd.";
      card.replaceChildren(heading, description, status);
    }
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "Er ging iets mis. Probeer opnieuw.";
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = 'LET ME IN <span aria-hidden="true">↗</span>';
    }
  }
});
