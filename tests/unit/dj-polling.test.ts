import { describe, expect, it, vi } from "vitest";
import { createDjPollingController } from "../../apps/web/modules/dj-polling.js";

describe("DJ polling controller", () => {
  it("refreshes both views immediately and repeats them every five seconds", () => {
    const refresh = vi.fn();
    const refreshSpotify = vi.fn();
    let tick;
    const schedule = vi.fn((callback, delay) => {
      tick = callback;
      return 17;
    });
    const cancel = vi.fn();
    const polling = createDjPollingController(refresh, refreshSpotify, 5000, schedule, cancel);

    polling.start();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refreshSpotify).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 5000);

    tick();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refreshSpotify).toHaveBeenCalledTimes(2);
  });

  it("replaces an existing interval when started again and stops idempotently", () => {
    const refresh = vi.fn();
    const refreshSpotify = vi.fn();
    const schedule = vi.fn()
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2);
    const cancel = vi.fn();
    const polling = createDjPollingController(refresh, refreshSpotify, 5000, schedule, cancel);

    polling.start();
    polling.start();
    expect(cancel).toHaveBeenCalledWith(1);
    polling.stop();
    polling.stop();
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenLastCalledWith(2);
  });
});
