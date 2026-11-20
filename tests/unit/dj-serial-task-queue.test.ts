import { describe, expect, it } from "vitest";
import { createSerialTaskQueue } from "../../apps/web/modules/dj-serial-task-queue.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe("serial task queue", () => {
  it("executes commands in order without dropping any", async () => {
    const gate = deferred();
    const started = deferred();
    const calls = [];
    const queue = createSerialTaskQueue();
    const first = queue.enqueue(async () => {
      calls.push("play");
      started.resolve();
      await gate.promise;
    });
    await started.promise;
    const second = queue.enqueue(async () => calls.push("next"));
    const third = queue.enqueue(async () => calls.push("pause"));
    expect(queue.isBusy()).toBe(true);
    gate.resolve();
    await Promise.all([first, second, third]);
    expect(calls).toEqual(["play", "next", "pause"]);
    expect(queue.isBusy()).toBe(false);
  });

  it("skips commands waiting when the DJ session is invalidated", async () => {
    const gate = deferred();
    const started = deferred();
    const calls = [];
    const queue = createSerialTaskQueue();
    const first = queue.enqueue(async () => {
      calls.push("in-flight");
      started.resolve();
      await gate.promise;
    });
    await started.promise;
    const stale = queue.enqueue(async () => calls.push("must-not-run"));
    queue.invalidate();
    gate.resolve();
    await Promise.all([first, stale]);
    expect(calls).toEqual(["in-flight"]);
    expect(await stale).toEqual({ skipped: true });
    expect(queue.isBusy()).toBe(false);
  });

  it("continues after a rejected command", async () => {
    const queue = createSerialTaskQueue();
    await expect(queue.enqueue(async () => { throw new Error("Spotify unavailable"); }))
      .rejects.toThrow("Spotify unavailable");
    await expect(queue.enqueue(async () => "ok")).resolves.toBe("ok");
  });

  it("marks the active command stale after invalidation", async () => {
    let current;
    const queue = createSerialTaskQueue();
    await queue.enqueue(async (context) => { current = context.isCurrent; });
    expect(current()).toBe(true);
    queue.invalidate();
    expect(current()).toBe(false);
  });
});
