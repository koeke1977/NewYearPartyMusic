import { describe, expect, it, vi } from "vitest";
import { createDjAiAssistantView } from "../../apps/web/modules/dj-ai-assistant-view.js";

function element() {
  const listeners = {};
  return {
    className: "",
    textContent: "",
    value: "",
    checked: false,
    disabled: false,
    children: [],
    listeners,
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = [...items]; },
    addEventListener(name, handler) { listeners[name] = handler; },
  };
}

function setup() {
  const documentRef = { createElement: () => element() };
  const output = element();
  return { view: createDjAiAssistantView({ documentRef }), output };
}

describe("DJ AI assistant view", () => {
  it("renders a queue proposal and invokes explicit confirmation before completion", async () => {
    const { view, output } = setup();
    const onConfirm = vi.fn(async () => {});
    view.renderQueueProposal(output, { answer: "1. Song — Artist", queueLength: 1, onConfirm });

    const panel = output.children[1];
    const confirmButton = panel.children[1];
    await confirmButton.listeners.click();

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(output.children[1].textContent).toContain("Wachtrij effectief herschikt");
  });

  it("keeps the current queue when a proposal is cancelled", () => {
    const { view, output } = setup();
    const onCancel = vi.fn();
    view.renderQueueProposal(output, { answer: "1. Song — Artist", queueLength: 1, onConfirm: vi.fn(), onCancel });

    const panel = output.children[1];
    panel.children[2].listeners.click();

    expect(onCancel).toHaveBeenCalledOnce();
    expect(output.children[1].textContent).toContain("huidige wachtrij blijft ongewijzigd");
  });

  it("renders Spotify choices and passes only selected tracks to the controller", async () => {
    const { view, output } = setup();
    const onAddSelected = vi.fn(async () => ({
      added: [{ track: { name: "Song B" } }],
      alreadyQueued: [],
      failed: [],
    }));
    view.renderTrackSuggestions(output, {
      answer: "Een paar suggesties.",
      mode: "fill",
      results: { results: [{
        query: "Song",
        tracks: [
          { id: "track-a", name: "Song A", artists: ["Artist"], albumImageUrl: null },
          { id: "track-b", name: "Song B", artists: ["Artist"], albumImageUrl: null },
        ],
      }] },
      onAddSelected,
    });

    const group = output.children[2];
    const secondOption = group.children[2];
    const secondRadio = secondOption.children[0];
    secondRadio.checked = true;
    await output.children[3].listeners.click();

    expect(onAddSelected).toHaveBeenCalledWith([
      expect.objectContaining({ track: expect.objectContaining({ id: "track-b" }) }),
    ]);
    expect(output.children.at(-1).textContent).toContain("1 nieuw toegevoegd aan UP NEXT");
  });
});
