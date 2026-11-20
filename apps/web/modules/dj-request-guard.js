export function createLatestRequestController() {
  let generation = 0;
  let activeRequest = null;

  const isCurrent = (request) => request !== null && request === activeRequest;

  return {
    begin() {
      if (activeRequest !== null) return null;
      const request = ++generation;
      activeRequest = request;
      return request;
    },
    isCurrent,
    complete(request) {
      if (!isCurrent(request)) return false;
      activeRequest = null;
      return true;
    },
    invalidate() {
      generation += 1;
      activeRequest = null;
    },
  };
}
