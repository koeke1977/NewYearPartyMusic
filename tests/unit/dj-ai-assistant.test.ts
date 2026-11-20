import { describe, expect, it, vi } from "vitest";
import { createDjAiAssistant } from "../../apps/web/modules/dj-ai-assistant.js";

function element() {
  const listeners = {};
  return {
    value: "",
    textContent: "",
    innerText: "",
    disabled: false,
    listeners,
    children: [],
    addEventListener(name, handler) { listeners[name] = handler; },
    replaceChildren(...items) { this.children = [...items]; },
    append(...items) { this.children.push(...items); },
  };
}

function setup() {
  const elements = {
    "#dj-ai-form": element(),
    "#dj-ai-prompt": element(),
    "#dj-ai-submit": element(),
    "#dj-ai-answer": element(),
  };
  const documentRef = {
    querySelector: selector => elements[selector],
    querySelectorAll: () => [],
    createElement: () => element(),
  };
  const api = vi.fn(async () => ({ answer: "De sfeer zit goed: bouw rustig op." }));
  const refresh = vi.fn(async () => {});
  const assistant = createDjAiAssistant({ api, refresh, documentRef });
  return { assistant, api, refresh, elements };
}

describe("DJ AI assistant", () => {
  it("submits a free-text advice prompt and renders the answer", async () => {
    const { api, elements } = setup();
    elements["#dj-ai-prompt"].value = "Geef advies over de sfeer van de avond.";

    let prevented = false;
    await elements["#dj-ai-form"].listeners.submit({
      preventDefault() { prevented = true; },
    });

    expect(prevented).toBe(true);
    expect(api).toHaveBeenCalledWith("/api/dj/ai/assistant", {
      method: "POST",
      body: JSON.stringify({ prompt: "Geef advies over de sfeer van de avond." }),
    });
    expect(elements["#dj-ai-answer"].children[0].textContent).toBe("De sfeer zit goed: bouw rustig op.");
    expect(elements["#dj-ai-answer"].children[1].textContent).toContain("geen Spotify-trackdata of live wachtrij");
    expect(elements["#dj-ai-prompt"].value).toBe("");
    expect(elements["#dj-ai-submit"].disabled).toBe(false);
  });

  it("does not send an empty prompt", async () => {
    const { api, elements } = setup();
    elements["#dj-ai-prompt"].value = "   ";

    await elements["#dj-ai-form"].listeners.submit({ preventDefault: vi.fn() });

    expect(api).not.toHaveBeenCalled();
  });
});
