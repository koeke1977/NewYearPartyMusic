import type { Env } from "../env";
import { getDjOverview, reorderDjQueue, updateDjSetting } from "../../modules/requests/application/dj-queue-management";
import { moderatePartyRequest, queueApprovedPartyRequest } from "../../modules/requests/application/guest-request-lifecycle";
import { createGuestRequestRepository } from "../../modules/requests/infrastructure/guest-request-d1-repository";
import { createDjQueueRepository } from "../../modules/requests/infrastructure/dj-queue-d1-repository";

/** Wires DJ request application workflows to their Cloudflare D1 repositories. */
export function getDjOverviewFromEnvironment(env: Env) {
  return getDjOverview({
    repository: createDjQueueRepository(env.DB),
    eventId: env.EVENT_ID,
  });
}

export function reorderDjQueueFromEnvironment(env: Env, order: unknown) {
  return reorderDjQueue({
    repository: createDjQueueRepository(env.DB),
    eventId: env.EVENT_ID,
    order,
  });
}

export function moderatePartyRequestFromEnvironment(env: Env, requestId: string, action: string) {
  return moderatePartyRequest({
    repository: createGuestRequestRepository(env.DB),
    eventId: env.EVENT_ID,
    requestId,
    action,
  });
}

export function updateDjSettingFromEnvironment(env: Env, key: string, enabled: unknown) {
  return updateDjSetting({
    repository: createDjQueueRepository(env.DB),
    key,
    enabled,
  });
}

export function queueApprovedPartyRequestFromEnvironment(env: Env, requestId: string) {
  return queueApprovedPartyRequest({
    repository: createGuestRequestRepository(env.DB),
    eventId: env.EVENT_ID,
    requestId,
  });
}
