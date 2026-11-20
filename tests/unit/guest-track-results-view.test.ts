import { describe, expect, it, vi } from "vitest";
import { renderGuestTrackResults } from "../../apps/web/modules/guest-track-results-view.js";

function createNode(tag, className, text) {
  return {
    tag, className, textContent: text || "", children: [], listeners: {}, attributes: {},
    href: "", target: "", rel: "",
    classList: { add: vi.fn(name => { this.className += " " + name; }) },
    append(...children) { this.children.push(...children); },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

function createResults() {
  return {
    children: [],
    replaceChildren: vi.fn(function () { this.children = []; }),
    append(child) { this.children.push(child); },
  };
}

describe("guest track results view", () => {
  it("renders Spotify metadata with a direct link and request action", () => {
    const results = createResults();
    const onRequest = vi.fn();
    const track = {
      id: "track-1",
      name: "Music Sounds Better With You",
      artists: ["Stardust", "Benjamin Diamond"],
      durationMs: 185000,
      albumImageUrl: "https://images.example/cover.jpg",
    };

    renderGuestTrackResults(results, [track], onRequest, createNode);

    expect(results.replaceChildren).toHaveBeenCalledOnce();
    expect(results.children).toHaveLength(1);
    const [image, details, button] = results.children[0].children;
    expect(image).toMatchObject({
      tag: "img", className: "track-cover", src: "https://images.example/cover.jpg",
      alt: "Albumcover", loading: "lazy",
    });
    const link = details.children[0];
    expect(link.href).toBe("https://open.spotify.com/track/track-1");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.children.map(child => child.textContent)).toEqual([
      track.name, "Stardust, Benjamin Diamond",
    ]);
    expect(details.children[1].textContent).toBe("3:05");
    expect(button.textContent).toBe("AANVRAGEN");
    button.listeners.click();
    expect(onRequest).toHaveBeenCalledWith(track, button);
  });

  it("renders a fallback cover when Spotify has no album artwork", () => {
    const results = createResults();
    const track = {
      id: "track-2", name: "Unknown Cover", artists: ["Artist"],
      durationMs: 60000, albumImageUrl: null,
    };
    renderGuestTrackResults(results, [track], vi.fn(), createNode);
    expect(results.children[0].children[0]).toMatchObject({
      tag: "div", className: "track-cover track-cover-empty", textContent: "♪",
    });
  });
});
