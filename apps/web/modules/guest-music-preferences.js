import { element } from "./dom.js";
import { loadGuestMusicTaxonomy, saveGuestMusicPreferences } from "./guest-music-api.js";

export function renderGuestMusicPreferences(card, session) {
  const panel = element("section", "guest-preferences");
  panel.setAttribute("aria-labelledby", "preferences-title");
  const heading = element("div", "section-heading");
  heading.append(element("span", "step", "02"));
  const title = element("div");
  title.append(element("h2", "", "Welke muziek hoor jij graag?"),
    element("p", "", "Help de DJ de sfeer te vinden. Je keuzes gelden alleen voor dit feest."));
  heading.append(title);
  panel.append(heading);

  const status = element("p", "form-message preference-message");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const groups = element("div", "preference-groups");
  panel.append(groups, status);

  const save = element("button", "button button-primary preference-save", "BEWAAR MIJN MUZIEKSMAAK");
  save.type = "button";
  panel.append(save);
  card.append(panel);

  const selected = { genreIds: new Set(), decadeIds: new Set(), moodIds: new Set(), energy: null };
  const checkbox = (name, id, label, set) => {
    const wrapper = element("label", "preference-choice");
    const input = element("input");
    input.type = "checkbox";
    input.value = id;
    input.addEventListener("change", () => input.checked ? set.add(id) : set.delete(id));
    wrapper.append(input, element("span", "", label));
    return wrapper;
  };

  async function load() {
    try {
      const taxonomy = await loadGuestMusicTaxonomy();
      const genreGroup = element("div", "preference-group");
      genreGroup.append(element("h3", "", "Muziekstijlen — kies wat je graag hoort"));
      for (const genre of taxonomy.genres) {
        const details = element("details", "preference-genre");
        const summary = element("summary", "", genre.label);
        details.append(summary);
        const choices = element("div", "preference-options");
        choices.append(checkbox("genre", genre.id, genre.label + " (algemeen)", selected.genreIds));
        for (const subgenre of genre.subgenres) {
          choices.append(checkbox("subgenre", subgenre.id, subgenre.label, selected.genreIds));
        }
        details.append(choices);
        genreGroup.append(details);
      }
      groups.append(genreGroup);

      const decadeGroup = element("div", "preference-group");
      decadeGroup.append(element("h3", "", "Favoriete decennia (optioneel)"));
      const decades = element("div", "preference-options preference-inline");
      for (const decade of taxonomy.decades) decades.append(checkbox("decade", decade.id, decade.label, selected.decadeIds));
      decadeGroup.append(decades);
      groups.append(decadeGroup);

      const moodGroup = element("div", "preference-group");
      moodGroup.append(element("h3", "", "Sfeer (optioneel)"));
      const moods = element("div", "preference-options preference-inline");
      const moodLabels = { "feel-good":"Feel-good", nostalgic:"Nostalgisch", energetic:"Energie", romantic:"Romantisch", dark:"Donker", playful:"Speels", anthemic:"Meebrullen", "laid-back":"Relaxed", singalong:"Meezingen", unexpected:"Verrassend" };
      for (const mood of taxonomy.moods) moods.append(checkbox("mood", mood, moodLabels[mood] || mood, selected.moodIds));
      moodGroup.append(moods);
      groups.append(moodGroup);

      const energyGroup = element("div", "preference-group");
      const energyLabel = element("label", "preference-energy-label", "Gewenste energie: niet ingesteld");
      const energy = element("input", "preference-energy");
      energy.type = "range"; energy.min = "1"; energy.max = "10"; energy.value = "5";
      energy.addEventListener("input", () => {
        selected.energy = Number(energy.value);
        energyLabel.textContent = "Gewenste energie: " + energy.value + "/10";
      });
      energyGroup.append(energyLabel, energy);
      groups.append(energyGroup);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Muziekstijlen laden lukte niet.";
      save.disabled = true;
    }
  }

  save.addEventListener("click", async () => {
    if (!selected.genreIds.size) {
      status.textContent = "Kies minstens één muziekstijl.";
      return;
    }
    save.disabled = true;
    status.textContent = "We bewaren je voorkeuren…";
    try {
      await saveGuestMusicPreferences({
        genreIds: [...selected.genreIds], decadeIds: [...selected.decadeIds],
        moodIds: [...selected.moodIds], energy: selected.energy,
      }, session.token);
      status.textContent = "Bedankt! Je muzieksmaak telt mee voor de DJ.";
      save.textContent = "VOORKEUREN BEWAARD ✓";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Opslaan lukte niet.";
      save.disabled = false;
    }
  });
  load();
}
