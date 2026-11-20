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
    href: "",
    target: "",
    rel: "",
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
  it("explains that general AI advice has no Spotify or live queue context", () => {
    const { view, output } = setup();
    view.renderAdvice(output, "Bouw rustig op.");
    expect(output.children[0].textContent).toBe("Bouw rustig op.");
    expect(output.children[1].textContent).toContain("geen Spotify-trackdata of live wachtrij");
  });

  it("renders Spotify choices with links back to Spotify and passes only selected tracks", async () => {
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
    const firstRadio = group.children[1].children[0].children[0];
    const secondRadio = secondOption.children[0].children[0];
    const spotifyLink = secondOption.children[1];
    expect(spotifyLink.href).toBe("https://open.spotify.com/track/track-b");
    expect(spotifyLink.target).toBe("_blank");
    expect(spotifyLink.rel).toContain("noopener");
    firstRadio.checked = false;
    secondRadio.checked = true;
    await output.children[3].listeners.click();

    expect(onAddSelected).toHaveBeenCalledWith([
      expect.objectContaining({ track: expect.objectContaining({ id: "track-b" }) }),
    ]);
    expect(output.children.at(-1).textContent).toContain("1 nieuw toegevoegd aan UP NEXT");
  });
});
