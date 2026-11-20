export function createDjPollingController(
  refresh,
  refreshSpotify,
  intervalMs = 5000,
  schedule = setInterval,
  cancel = clearInterval,
) {
  let handle = null;

  return {
    start() {
      refresh();
      refreshSpotify();
      if (handle !== null) cancel(handle);
      handle = schedule(() => {
        refresh();
        refreshSpotify();
      }, intervalMs);
    },
    stop() {
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
    },
  };
}
