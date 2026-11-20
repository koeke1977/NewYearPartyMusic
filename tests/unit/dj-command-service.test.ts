import { describe, expect, it, vi } from "vitest";
import { createDjCommandService } from "../../apps/web/modules/dj-command-service.js";

describe("DJ command service", () => {
  it("uses the queue endpoint for queue actions and refreshes after success", async () => {
    const api = vi.fn(async () => ({}));
    const refresh = vi.fn(async () => {});
    const onMessage = vi.fn();
    const service = createDjCommandService({ api, refresh, onMessage });

    await service.runRequestAction("request/1", "queue", { disabled: false });

    expect(api).toHaveBeenCalledWith("/api/dj/spotify/queue/request%2F1", { method: "POST" });
    expect(refresh).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenLastCalledWith("Deck updated.");
  });

  it("reenables a moderation button after an API failure", async () => {
    const failure = new Error("Request failed");
    const api = vi.fn(async () => { throw failure; });
    const button = { disabled: false };
    const onMessage = vi.fn();
    const service = createDjCommandService({ api, refresh: vi.fn(), onMessage });

    await service.runRequestAction("request-1", "approve", button);

    expect(button.disabled).toBe(false);
    expect(onMessage).toHaveBeenLastCalledWith("Request failed");
  });

  it("updates a party setting with the existing endpoint contract", async () => {
    const api = vi.fn(async () => ({}));
    const refresh = vi.fn(async () => {});
    const service = createDjCommandService({ api, refresh, onMessage: vi.fn() });

    await service.updateSetting("auto_queue", true);

    expect(api).toHaveBeenCalledWith("/api/dj/settings/auto_queue", {
      method: "POST",
      body: JSON.stringify({ enabled: true }),
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("dispatches the next PartyQueue request and refreshes playback", async () => {
    const track = { name: "Track A", artist: "Artist A" };
    const api = vi.fn(async () => ({ track }));
    const refresh = vi.fn(async () => {});
    const refreshPlayback = vi.fn(async () => {});
    const onTrackStarted = vi.fn();
    const onMessage = vi.fn();
    const button = { disabled: false };
    const service = createDjCommandService({ api, refresh, onMessage });

    await service.runNextRequest({ button, onTrackStarted, refreshPlayback });

    expect(api).toHaveBeenCalledWith("/api/dj/spotify/next-request", { method: "POST" });
    expect(onTrackStarted).toHaveBeenCalledWith(track);
    expect(refreshPlayback).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenCalledWith("Now playing PartyQueue request: Track A — Artist A");
  });

  it("reports a busy next-request command without starting a track", async () => {
    const api = vi.fn(async () => ({ busy: true, error: "NEXT wordt al verwerkt." }));
    const onMessage = vi.fn();
    const onTrackStarted = vi.fn();
    const service = createDjCommandService({ api, refresh: vi.fn(), onMessage });

    await service.runNextRequest({
      button: { disabled: false },
      onTrackStarted,
      refreshPlayback: vi.fn(),
    });

    expect(onTrackStarted).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith("NEXT wordt al verwerkt.");
  });

  it("does not send overlapping queue reorder writes", async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const api = vi.fn(async () => { await gate; });
    const refresh = vi.fn(async () => {});
    const service = createDjCommandService({ api, refresh, onMessage: vi.fn() });

    const first = service.saveQueueOrder(["a", "b"]);
    await Promise.resolve();
    const second = service.saveQueueOrder(["b", "a"]);
    await second;

    expect(api).toHaveBeenCalledOnce();
    release();
    await first;
    expect(refresh).toHaveBeenCalledOnce();
  });
});
