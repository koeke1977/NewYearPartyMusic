import type { Env } from "../platform/env";
import { cleanupCompletedRequests } from "../modules/requests/application/cleanup-completed-requests";
import { createRequestRetentionRepository } from "../modules/requests/infrastructure/request-retention-repository";

export function handleScheduled(
  _controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): void {
  ctx.waitUntil(cleanupCompletedRequests(createRequestRetentionRepository(env.DB)));
}
