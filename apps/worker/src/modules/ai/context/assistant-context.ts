import type { EventMoment } from "./event-moment";
import type { DJAssistantContext } from "../prompts/dj-assistant";

export type AssistantQueueTrack = {
  id: string;
  track_name: string;
  artist_name: string;
  duration_ms: number | null;
  status: string;
  queued_at: string | null;
  requested_at: string;
};

export type AssistantPlayedTrack = {
  track_name: string;
  artist_name: string;
};

export type AssistantRequestCount = {
  status: string;
  count: number;
};

export type AssistantSetHistoryEntry = {
  at: string;
  tracks: string[];
};

export type BuildAssistantContextInput = {
  event: string;
  eventMoment: EventMoment;
  djPreferences: string[];
  acceptedSetHistory: AssistantSetHistoryEntry[];
  tracks: AssistantQueueTrack[];
  playedTracks: AssistantPlayedTrack[];
  requestCounts: AssistantRequestCount[];
  savedQueueOrder: string[];
};

/**
 * Builds a stable, provider-independent snapshot for the AI.
 * Queue order is authoritative: saved DJ order first, then queued timestamp fallback.
 */
export function buildDJAssistantContext(input: BuildAssistantContextInput): DJAssistantContext {
  const orderIndex = new Map(input.savedQueueOrder.map((id, index) => [id, index]));
  const queued = input.tracks
    .filter((track) => track.status === "queued")
    .sort((a, b) =>
      (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
      String(a.queued_at || a.requested_at).localeCompare(String(b.queued_at || b.requested_at))
    );
  const recent = input.playedTracks;

  return {
    event: input.event,
    eventMoment: input.eventMoment,
    djPreferences: input.djPreferences,
    acceptedSetHistory: input.acceptedSetHistory.slice(-5),
    currentlyLastPlayed: recent[0]
      ? recent[0].track_name + " — " + recent[0].artist_name
      : "unknown",
    upNext: queued.map((track) =>
      track.track_name + " — " + track.artist_name +
      " [" + Math.round((track.duration_ms || 0) / 60000) + " min]"
    ),
    recentPlayed: recent.map((track) => track.track_name + " — " + track.artist_name),
    requestMix: Object.fromEntries(input.requestCounts.map((row) => [row.status, row.count])),
  };
}

export function parseSavedQueueOrder(value: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function parseAcceptedSetHistory(value: string | null | undefined): AssistantSetHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is AssistantSetHistoryEntry =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as AssistantSetHistoryEntry).at === "string" &&
      Array.isArray((entry as AssistantSetHistoryEntry).tracks) &&
      (entry as AssistantSetHistoryEntry).tracks.every((track) => typeof track === "string")
    ).slice(-5);
  } catch {
    return [];
  }
}
