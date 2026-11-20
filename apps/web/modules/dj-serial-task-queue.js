// Runs playback commands in order and invalidates commands still waiting when a DJ session ends.
export function createSerialTaskQueue() {
  let generation = 0;
  let pending = 0;
  let tail = Promise.resolve();

  return {
    enqueue(task) {
      const requestId = generation;
      pending += 1;
      const result = tail.catch(() => undefined).then(async () => {
        if (requestId !== generation) return { skipped: true };
        return task({ isCurrent: () => requestId === generation });
      });
      tail = result;
      return result.finally(() => {
        pending = Math.max(0, pending - 1);
      });
    },
    isBusy() {
      return pending > 0;
    },
    invalidate() {
      generation += 1;
    },
  };
}
