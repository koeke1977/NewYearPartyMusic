import { describe, expect, it } from "vitest";
import { createLatestTaskQueue } from "../../apps/web/modules/dj-latest-task-queue.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe("latest task queue", () => {
  it("serializes writes and skips queued values superseded by a newer value", async () => {
    const gate = deferred();
    const started = deferred();
    const writes = [];
    const queue = createLatestTaskQueue(async (value) => {
      writes.push(value);
      if (value === 10) {
        started.resolve();
        await gate.promise;
      }
    });

    const first = queue.enqueue(10);
    await started.promise;
    const superseded = queue.enqueue(20);
    const latest = queue.enqueue(30);
    gate.resolve();

    await Promise.all([first, superseded, latest]);
    expect(writes).toEqual([10, 30]);
    expect(await superseded).toEqual({ skipped: true });
  });

  it("invalidates queued work when the session ends", async () => {
    const writes = [];
    const queue = createLatestTaskQueue(async (value) => writes.push(value));
    const pending = queue.enqueue("old session");
    queue.invalidate();

    expect(await pending).toEqual({ skipped: true });
    expect(writes).toEqual([]);
  });

  it("continues processing after a failed task", async () => {
    const writes = [];
    const queue = createLatestTaskQueue(async (value) => {
      writes.push(value);
      if (value === "bad") throw new Error("temporary failure");
    });

    await expect(queue.enqueue("bad")).rejects.toThrow("temporary failure");
    await expect(queue.enqueue("good")).resolves.toBeUndefined();
    expect(writes).toEqual(["bad", "good"]);
  });
});
