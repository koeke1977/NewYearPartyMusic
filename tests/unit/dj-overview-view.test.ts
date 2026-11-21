import { describe, expect, it, vi } from "vitest";
import { createDjOverviewView } from "../../apps/web/modules/dj-overview-view.js";

function node() {
  return {
    textContent: "", disabled: false, title: "", href: "", target: "", rel: "", dataset: {},
    classList: { toggle: vi.fn() },
    setAttribute: vi.fn(),
    replaceChildren: vi.fn(),
    append: vi.fn(),
    appendChild(child) { return child; },
  };
}

describe("DJ overview view", () => {
  it("preserves request cards while a drag reorder is in progress and links the next track", () => {
    const selectors = [
      "#auto-queue-state", "#pause-toggle", "#approval-toggle", "#auto-queue-toggle", "#ai-autopilot-toggle",
      "#pause-state", "#approval-state", "#dj-stats", "#up-next", "#queue-total",
      "#partyqueue-next", "#request-count", "#last-updated",
    ];
    const elements = Object.fromEntries(selectors.map(selector => [selector, node()]));
    const documentRef = { querySelector: selector => elements[selector] || null };
    const requestList = node();
    const spotifyConsole = { setDeck: vi.fn() };
    const queueReorder = { isDragging: () => true };
    const view = createDjOverviewView({
      requestList, queueReorder, commands: {}, spotifyConsole, documentRef,
      elementFactory: (tag, className, text) => Object.assign(node(), { tag, className, textContent: text || "", children: [], append(...items){this.children.push(...items);} }),
    });

    view.render({
      settings: { requestsPaused: false, autoApprove: true, autoQueue: false, aiAutopilot: true },
      requests: [{
        id: "queued-1", spotify_track_id: "track-1", status: "queued",
        duration_ms: 180000, track_name: "Track", artist_name: "Artist",
        album_image_url: "https://img.example/cover.jpg",
      }],
      queueOrder: ["queued-1"],
    });

    expect(requestList.replaceChildren).not.toHaveBeenCalled();
    expect(spotifyConsole.setDeck).toHaveBeenCalledWith("right", expect.objectContaining({
      id: "track-1",
      name: "Track",
    }));
    expect(view.getLatestOverview().requests).toHaveLength(1);
    expect(view.getSettings().autoQueue).toBe(false);\n    expect(elements["#ai-autopilot-toggle"].textContent).toBe("AUTOPILOT AAN · STOP NU");\n    expect(elements["#ai-autopilot-toggle"].setAttribute).toHaveBeenCalledWith("aria-pressed", "true");
  });
});
