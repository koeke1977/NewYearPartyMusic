export function orderedQueued(requests, queueOrder = []) {
  const positions = new Map(
    (Array.isArray(queueOrder) ? queueOrder : []).map((id, index) => [id, index]),
  );
  return requests
    .filter((request) => request.status === "queued")
    .sort((a, b) =>
      (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
      (a.queued_at || a.requested_at || "").localeCompare(b.queued_at || b.requested_at || ""),
    );
}
