import type { EventMoment } from "./event-moment";
import type { PartyQueueContext } from "../application/assistant-ports";
import type { DJAssistantContext } from "../prompts/dj-assistant";
export type BuildAssistantContextInput = {
  event: string;
  eventMoment: EventMoment;
  djPreferences: string[];
  partyQueue: PartyQueueContext;
};
/** Builds bounded, event-scoped context for DJ decisions. */
export function buildDJAssistantContext(input: BuildAssistantContextInput): DJAssistantContext {
  return { event: input.event, eventMoment: input.eventMoment, djPreferences: input.djPreferences, partyQueue: input.partyQueue };
}
