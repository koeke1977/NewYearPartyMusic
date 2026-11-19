const form = document.querySelector("#join-form");
const message = document.querySelector("#form-message");

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const nickname = String(data.get("nickname") || "").trim();
  const eventCode = String(data.get("eventCode") || "").trim();

  if (nickname.length < 2 || !eventCode) {
    message.textContent = "Vul een nickname en de feestcode in.";
    return;
  }

  // Guest session/API flow is implemented in the next development slice.
  message.textContent = "De PartyQueue-interface staat klaar. De toegang wordt in de volgende ontwikkelstap gekoppeld.";
});
