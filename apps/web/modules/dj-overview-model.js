import { orderedQueued } from "./dj-queue.js";

const ACTIVE_STATUSES = new Set(["pending", "approved", "queued"]);
const TRACKED_STATUSES = new Set([...ACTIVE_STATUSES, "played"]);

function sumDuration(requests, statuses) {
  return requests.reduce((total, request) => {
    if (!statuses.has(request.status)) return total;
    return total + (Number(request.duration_ms) || 0);
  }, 0);
}

// Pure projection of the Worker overview response for the DJ console.
export function createDjOverviewModel(data = {}) {
  const requests = Array.isArray(data.requests) ? data.requests : [];
  const queueOrder = Array.isArray(data.queueOrder) ? data.queueOrder : [];
  const queued = orderedQueued(requests, queueOrder);
  const liveRequests = requests.filter(request => ACTIVE_STATUSES.has(request.status));
  const queuedLive = orderedQueued(liveRequests, queueOrder);
  const queuePositions = new Map(queuedLive.map((request, index) => [request.id, index]));

  return {
    settings: data.settings || null,
    requests,
    queueOrder,
    counts: {
      total: requests.length,
      queued: requests.filter(request => request.status === "queued").length,
      played: requests.filter(request => request.status === "played").length,
    },
    durations: {
      requested: sumDuration(requests, TRACKED_STATUSES),
      remaining: sumDuration(requests, ACTIVE_STATUSES),
    },
    queued,
    nextQueued: queued[0] || null,
    liveRequests,
    queuePositions,
  };
}
