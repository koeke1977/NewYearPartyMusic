import { describe, expect, it, vi } from "vitest";
import { createDjPlaybackCoordinator } from "../../apps/web/modules/dj-playback-coordinator.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe("DJ playback coordinator", () => {
  it("blocks status reads while transport commands are pending", async () => {
    const gate = deferred();
    const started = deferred();
    const coordinator = createDjPlaybackCoordinator({
      getToken: () => "dj-token",
      sendCommand: async () => { started.resolve(); await gate.promise; },
      refreshStatus: vi.fn(),
    });

    const command = coordinator.runCommand("play");
    await started.promise;
    expect(coordinator.beginStatus()).toBeNull();
    gate.resolve();
    await command;
  });

  it("invalidates a status response as soon as a command starts", async () => {
    const coordinator = createDjPlaybackCoordinator({
      getToken: () => "dj-token",
      sendCommand: async () => {},
      refreshStatus: async () => {},
    });
    const requestId = coordinator.beginStatus();

    await coordinator.runCommand("pause");

    expect(coordinator.isStatusCurrent(requestId)).toBe(false);
    expect(coordinator.completeStatus(requestId)).toBe(false);
  });

  it("preserves command order and refreshes status only after the queue drains", async () => {
    const gate = deferred();
    const started = deferred();
    const calls = [];
    const coordinator = createDjPlaybackCoordinator({
      getToken: () => "dj-token",
      sendCommand: async (action) => {
        calls.push(action);
        if (action === "play") { started.resolve(); await gate.promise; }
      },
      refreshStatus: async () => { calls.push("status"); },
    });

    const first = coordinator.runCommand("play");
    await started.promise;
    const second = coordinator.runCommand("next");
    const third = coordinator.runCommand("pause");
    gate.resolve();
    await Promise.all([first, second, third]);

    expect(calls).toEqual(["play", "next", "pause", "status"]);
  });

  it("does not run queued commands or refresh status after session invalidation", async () => {
    const gate = deferred();
    const started = deferred();
    let token = "dj-token";
    const calls = [];
    const coordinator = createDjPlaybackCoordinator({
      getToken: () => token,
      sendCommand: async (action) => {
        calls.push(action);
        started.resolve();
        await gate.promise;
      },
      refreshStatus: async () => { calls.push("status"); },
    });

    const first = coordinator.runCommand("play");
    await started.promise;
    const queued = coordinator.runCommand("next");
    token = "";
    coordinator.invalidate();
    gate.resolve();
    await Promise.all([first, queued]);

    expect(calls).toEqual(["play"]);
  });

  it("reports a command failure and still reconciles status when the queue drains", async () => {
    const onCommandError = vi.fn();
    const calls = [];
    const failure = new Error("Spotify unavailable");
    const coordinator = createDjPlaybackCoordinator({
      getToken: () => "dj-token",
      sendCommand: async () => { throw failure; },
      refreshStatus: async () => { calls.push("status"); },
      onCommandError,
    });

    const result = await coordinator.runCommand("next");

    expect(result.error).toBe(failure);
    expect(onCommandError).toHaveBeenCalledWith(failure);
    expect(calls).toEqual(["status"]);
  });
});
