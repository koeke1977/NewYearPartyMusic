import type { Env } from "../platform/env";
import { deleteExpiredAuthAttemptBuckets } from "../modules/identity/infrastructure/auth-attempt-d1-repository";
import { cleanupCompletedRequests } from "../modules/requests/application/cleanup-completed-requests";
import { createRequestRetentionRepository } from "../modules/requests/infrastructure/request-retention-repository";

export function handleScheduled(
  _controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): void {
  ctx.waitUntil(Promise.all([
    cleanupCompletedRequests(createRequestRetentionRepository(env.DB)),
    deleteExpiredAuthAttemptBuckets(env.DB),
  ]));
}
