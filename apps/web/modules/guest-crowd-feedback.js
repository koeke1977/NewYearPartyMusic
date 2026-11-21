import { element } from "./dom.js";
import { submitGuestCrowdFeedback } from "./guest-music-api.js";

export function renderGuestCrowdFeedback(card, session) {
  const panel = element("section", "guest-crowd-feedback");
  panel.append(element("h2", "", "Hoe zit de sfeer?"), element("p", "crowd-feedback-intro", "Geef de DJ een seintje. Je feedback telt mee als groepssignaal, niet als persoonlijke beoordeling."));
  const atmosphere = element("div", "crowd-atmosphere");
  atmosphere.setAttribute("role", "group");
  atmosphere.setAttribute("aria-label", "Hoe is de sfeer?");
  let selected = "good";
  const options = [["good","🔥","Goed!"],["neutral","😐","Gaat wel"],["bad","🥱","Niet echt"]];
  for (const [value, icon, label] of options) {
    const button = element("button", "crowd-choice" + (value === selected ? " is-selected" : ""));
    button.type = "button";
    button.dataset.value = value;
    button.append(element("span", "", icon), element("span", "", label));
    button.setAttribute("aria-pressed", String(value === selected));
    button.addEventListener("click", () => {
      selected = value;
      for (const item of atmosphere.querySelectorAll("button")) {
        const active = item.dataset.value === selected;
        item.classList.toggle("is-selected", active);
        item.setAttribute("aria-pressed", String(active));
      }
    });
    atmosphere.append(button);
  }
  panel.append(atmosphere);
  const energyLabel = element("label", "crowd-energy-label", "Energie op de dansvloer: 3/5");
  const energy = element("input", "crowd-energy");
  energy.type = "range"; energy.min = "1"; energy.max = "5"; energy.step = "1"; energy.value = "3";
  energy.addEventListener("input", () => { energyLabel.textContent = "Energie op de dansvloer: " + energy.value + "/5"; });
  panel.append(energyLabel, energy);
  const send = element("button", "button button-primary crowd-send", "STUUR SFEERFEEDBACK");
  send.type = "button";
  const status = element("p", "form-message crowd-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  send.addEventListener("click", async () => {
    send.disabled = true;
    status.textContent = "Feedback doorsturen…";
    try {
      await submitGuestCrowdFeedback({ atmosphere: selected, energy: Number(energy.value) }, session.token);
      status.textContent = "Bedankt! Je signaal telt mee voor de DJ. Je kan dit over een minuut aanpassen.";
      send.textContent = "FEEDBACK VERSTUURD ✓";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Feedback versturen lukte niet.";
      send.disabled = false;
    }
  });
  panel.append(send, status);
  card.append(panel);
}
