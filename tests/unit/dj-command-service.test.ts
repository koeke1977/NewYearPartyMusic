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
