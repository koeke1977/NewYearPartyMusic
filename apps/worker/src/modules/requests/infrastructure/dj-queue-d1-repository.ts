import type { DjQueueRepository } from "../application/dj-queue-ports";
import type { GuestRequestDatabase } from "./guest-request-repository";
import {
  readActiveDjRequests, readRecentPlayedDjRequests, readDjOverviewSettings,
  readQueuedRequestIds, readQueuedRequestTracks, saveDjQueueOrder,
  readDjAiHistory, saveDjAiHistory, saveDjSetting,
} from "./dj-queue-repository";

export function createDjQueueRepository(db: GuestRequestDatabase): DjQueueRepository {
  return {
    readActiveRequests: eventId => readActiveDjRequests(db, eventId),
    readRecentPlayedRequests: eventId => readRecentPlayedDjRequests(db, eventId),
    readOverviewSettings: () => readDjOverviewSettings(db),
    readQueuedRequestIds: eventId => readQueuedRequestIds(db, eventId),
    readQueuedRequestTracks: eventId => readQueuedRequestTracks(db, eventId),
    saveQueueOrder: order => saveDjQueueOrder(db, order),
    readAiHistory: eventId => readDjAiHistory(db, eventId),
    saveAiHistory: (eventId, history) => saveDjAiHistory(db, eventId, history),
    saveSetting: (key, enabled) => saveDjSetting(db, key, enabled),
  };
}
