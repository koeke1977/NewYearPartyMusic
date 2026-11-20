import type { EventMoment } from "./event-moment";
import type { DJAssistantContext } from "../prompts/dj-assistant";

export type BuildAssistantContextInput = {
  event: string;
  eventMoment: EventMoment;
  djPreferences: string[];
};

/** Builds a minimal context from event timing and DJ-authored preferences only. */
export function buildDJAssistantContext(input: BuildAssistantContextInput): DJAssistantContext {
  return {
    event: input.event,
    eventMoment: input.eventMoment,
    djPreferences: input.djPreferences,
  };
}
