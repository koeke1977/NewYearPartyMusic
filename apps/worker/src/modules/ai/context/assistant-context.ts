import type { EventMoment } from "./event-moment";
import type { DJAssistantContext } from "../prompts/dj-assistant";

export type AssistantRequestCount = {
  status: string;
  count: number;
};

export type BuildAssistantContextInput = {
  event: string;
  eventMoment: EventMoment;
  djPreferences: string[];
  requestCounts: AssistantRequestCount[];
};

/** Builds a minimal context without any Spotify-derived track or playback metadata. */
export function buildDJAssistantContext(input: BuildAssistantContextInput): DJAssistantContext {
  return {
    event: input.event,
    eventMoment: input.eventMoment,
    djPreferences: input.djPreferences,
    requestMix: Object.fromEntries(input.requestCounts.map((row) => [row.status, row.count])),
  };
}
