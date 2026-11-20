export function createLatestRequestController() {
  let generation = 0;
  let activeRequest = null;

  return {
    begin() {
      if (activeRequest !== null) return null;
      const request = ++generation;
      activeRequest = request;
      return request;
    },
    isCurrent(request) {
      return request !== null && request === activeRequest;
    },
    complete(request) {
      if (!this.isCurrent(request)) return false;
      activeRequest = null;
      return true;
    },
    invalidate() {
      generation += 1;
      activeRequest = null;
    },
  };
}
