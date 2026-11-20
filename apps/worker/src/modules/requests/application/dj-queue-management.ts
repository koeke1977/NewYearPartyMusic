import type { DjQueueRepository } from "./dj-queue-ports";

export type QueueManagementOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: "invalid_order" | "queue_changed" | "unknown_setting" | "invalid_setting_value"; message: string } };

function parseStringArray(value: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function getDjOverview(input: {
  repository: DjQueueRepository;
  eventId: string;
}): Promise<Record<string, unknown>> {
  const [activeRequests, recentPlayed, config] = await Promise.all([
    input.repository.readActiveRequests(input.eventId),
    input.repository.readRecentPlayedRequests(input.eventId),
    input.repository.readOverviewSettings(),
  ]);
  const savedOrder = parseStringArray(config.partyqueue_order);
  const orderIndex = new Map(savedOrder.map((id, index) => [id, index]));
  const rows = [...(activeRequests.results || []), ...(recentPlayed.results || [])];
  rows.sort((a, b) => {
    const rank = (status: string) => status === "pending" ? 0 : status === "approved" ? 1 : status === "queued" ? 2 : status === "played" ? 3 : 4;
    const statusDiff = rank(a.status) - rank(b.status);
    if (statusDiff) return statusDiff;
    if (a.status === "queued") {
      return (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        || String(a.queued_at || a.requested_at).localeCompare(String(b.queued_at || b.requested_at));
    }
    return String(a.requested_at).localeCompare(String(b.requested_at));
  });
  const queuedIds = rows.filter(row => row.status === "queued").map(row => row.id);
  const queuedSet = new Set(queuedIds);
  const normalizedOrder = [...savedOrder.filter(id => queuedSet.has(id)), ...queuedIds.filter(id => !savedOrder.includes(id))];
  return {
    requests: rows,
    queueOrder: normalizedOrder,
    settings: {
      requestsPaused: config.requests_paused === "true",
      autoApprove: config.auto_approve === "true",
      autoQueue: config.auto_queue === "true",
    },
  };
}

export async function reorderDjQueue(input: {
  repository: DjQueueRepository;
  eventId: string;
  order: unknown;
  nowIso?: () => string;
}): Promise<QueueManagementOutcome<{ order: string[] }>> {
  if (!Array.isArray(input.order) || input.order.length > 100 || !input.order.every(id => typeof id === "string")) {
    return { ok: false, error: { code: "invalid_order", message: "Ongeldige wachtrijvolgorde." } };
  }
  const requested = input.order as string[];
  const currentIds = await input.repository.readQueuedRequestIds(input.eventId);
  if (new Set(requested).size !== requested.length || requested.length !== currentIds.length
    || currentIds.some(id => !requested.includes(id))) {
    return { ok: false, error: { code: "queue_changed", message: "De wachtrij is intussen gewijzigd. Vernieuw de lijst en probeer opnieuw." } };
  }

  const tracks = await input.repository.readQueuedRequestTracks(input.eventId);
  const trackById = new Map(tracks.map(track => [track.id, track]));
  if (tracks.length !== requested.length || requested.some(id => !trackById.has(id))) {
    return { status: 409, body: { error: "De wachtrij is intussen gewijzigd. Vernieuw de lijst en probeer opnieuw." } };
  }
  const acceptedTracks = requested.map(id => trackById.get(id)!)
    .map(track => track.track_name + " — " + track.artist_name);

  await input.repository.saveQueueOrder(requested);
  const previous = await input.repository.readAiHistory(input.eventId);
  const parsed = parseHistory(previous);
  parsed.push({ at: (input.nowIso || (() => new Date().toISOString()))(), tracks: acceptedTracks });
  await input.repository.saveAiHistory(input.eventId, parsed.slice(-5));
  return { ok: true, value: { order: requested } };
}

function parseHistory(value: string | null): Array<{ at: string; tracks: string[] }> {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is { at: string; tracks: string[] } =>
      !!item && typeof item === "object" && typeof (item as { at?: unknown }).at === "string"
      && Array.isArray((item as { tracks?: unknown }).tracks)
      && (item as { tracks: unknown[] }).tracks.every(track => typeof track === "string"));
  } catch {
    return [];
  }
}

export async function updateDjSetting(input: {
  repository: DjQueueRepository;
  key: string;
  enabled: unknown;
}): Promise<QueueManagementOutcome<{ enabled: boolean }>> {
  if (!["requests_paused", "auto_approve", "auto_queue"].includes(input.key)) {
    return { ok: false, error: { code: "unknown_setting", message: "Onbekende instelling." } };
  }
  if (typeof input.enabled !== "boolean") {
    return { ok: false, error: { code: "invalid_setting_value", message: "Ongeldige waarde." } };
  }
  await input.repository.saveSetting(input.key, input.enabled);
  return { ok: true, value: { enabled: input.enabled } };
}
