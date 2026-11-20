import type { Env } from "../platform/env";
import { cleanupCompletedRequests } from "../modules/requests/application/cleanup-completed-requests";

export function handleScheduled(
  _controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): void {
  ctx.waitUntil(cleanupCompletedRequests(env.DB));
}
