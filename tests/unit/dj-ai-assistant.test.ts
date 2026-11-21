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
  const planButton = element();
  planButton.dataset = { aiAction: "plan" };
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
    querySelectorAll: selector => selector === "[data-ai-action]" ? [planButton] : [],
  };
  const api = vi.fn(async () => ({ answer: "De sfeer zit goed: bouw rustig op.", conversationSaved: true }));
  const refresh = vi.fn(async () => {});
  const assistant = createDjAiAssistant({ api, refresh, documentRef, getSessionId: () => "11111111-1111-4111-8111-111111111111" });
  return { assistant, api, refresh, elements, planButton };
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
      body: JSON.stringify({ prompt: "Geef advies over de sfeer van de avond.", sessionId: "11111111-1111-4111-8111-111111111111" }),
      timeoutMs: 110000,
    });
    expect(elements["#dj-ai-answer"].children[0].textContent).toBe("De sfeer zit goed: bouw rustig op.");
    expect(elements["#dj-ai-answer"].children[1].textContent).toContain("Spotify UP NEXT, live playbackstatus en Spotify-catalogusverificatie zijn niet beschikbaar");
    expect(elements["#dj-ai-answer"].children[2].textContent).toContain("Gesprekscontext bewaard");
    expect(elements["#dj-ai-prompt"].value).toBe("");
    expect(elements["#dj-ai-submit"].disabled).toBe(false);
  });

  it("builds the setplan from PartyQueue and audience context rather than denying queue context", async () => {
    const { api, planButton } = setup();
    await planButton.listeners.click();
    const payload = JSON.parse(api.mock.calls[0][1].body);
    expect(payload.prompt).toContain("Gebruik de meegeleverde LIVE PARTY CONTEXT actief:");
    expect(payload.prompt).toContain("PartyQueue");
    expect(payload.prompt).toContain("geaggregeerde publieksvoorkeuren");
    expect(payload.prompt).toContain("PartyQueue is niet hetzelfde als Spotify UP NEXT");
    expect(payload.prompt).not.toContain("je ziet de actuele Spotify-wachtrij niet");
  });

  it("does not send an empty prompt", async () => {
    const { api, elements } = setup();
    elements["#dj-ai-prompt"].value = "   ";

    await elements["#dj-ai-form"].listeners.submit({ preventDefault: vi.fn() });

    expect(api).not.toHaveBeenCalled();
  });
});
