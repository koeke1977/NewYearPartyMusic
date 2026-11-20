import type { QueueDispatchRepository } from "../application/queue-dispatch-ports";
import type { QueueDispatchDatabase } from "./queue-dispatch-repository";
import {
  claimQueueDispatchLock, listQueuedPartyQueueRequests, markPartyQueueFallbackInactive,
  markPartyQueueRequestPlayed, readSavedPartyQueueOrder, releaseQueueDispatchLock, saveLastPartyQueueTrack,
} from "./queue-dispatch-repository";

export function createQueueDispatchRepository(db: QueueDispatchDatabase): QueueDispatchRepository {
  return {
    claimLock: owner => claimQueueDispatchLock(db, owner),
    listQueuedRequests: eventId => listQueuedPartyQueueRequests(db, eventId),
    readSavedOrder: () => readSavedPartyQueueOrder(db),
    markRequestPlayed: (eventId, requestId) => markPartyQueueRequestPlayed(db, eventId, requestId),
    markFallbackInactive: () => markPartyQueueFallbackInactive(db),
    saveLastTrack: track => saveLastPartyQueueTrack(db, track),
    releaseLock: owner => releaseQueueDispatchLock(db, owner),
  };
}
