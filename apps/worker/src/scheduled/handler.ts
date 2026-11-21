import { deleteExpiredAssistantConversationTurns } from "../modules/ai/infrastructure/assistant-conversation-repository";
import { runDJAutopilotFromEnvironment } from "../platform/composition/dj-autopilot";\n\nexport function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): void {
  if (controller.cron === "*/5 * * * *") {
    ctx.waitUntil(runDJAutopilotFromEnvironment(env));
    return;
  }
  if (controller.cron === "0 3 * * *") {
    ctx.waitUntil(Promise.all([
      cleanupCompletedRequests(createRequestRetentionRepository(env.DB)),
      deleteExpiredAuthAttemptBuckets(env.DB),
      deleteExpiredAssistantConversationTurns(env.DB),
    ]));
  }
}