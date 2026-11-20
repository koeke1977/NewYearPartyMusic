// Serializes asynchronous writes while dropping queued values superseded by a newer one.
export function createLatestTaskQueue(task) {
  let generation = 0;
  let tail = Promise.resolve();

  return {
    enqueue(value) {
      const requestId = ++generation;
      const result = tail.catch(() => undefined).then(() => {
        if (requestId !== generation) return { skipped: true };
        return task(value, {
          requestId,
          isCurrent: () => requestId === generation,
        });
      });
      tail = result;
      return result;
    },
    invalidate() {
      generation += 1;
    },
  };
}
