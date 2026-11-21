import { beforeEach, describe, expect, it, vi } from "vitest";

const runAutopilot = vi.fn(async () => ({ status: "disabled", queued: 0 }));
const cleanupRequests = vi.fn(async () => {});
const cleanupAuth = vi.fn(async () => {});
const cleanupConversations = vi.fn(async () => {});

vi.mock("../../apps/worker/src/platform/composition/dj-autopilot", () => ({
  runDJAutopilotFromEnvironment: (...args: unknown[]) => runAutopilot(...args),
}));
vi.mock("../../apps/worker/src/modules/requests/application/cleanup-completed-requests", () => ({
  cleanupCompletedRequests: (...args: unknown[]) => cleanupRequests(...args),
}));
vi.mock("../../apps/worker/src/platform/infrastructure/auth-attempt-d1-repository", () => ({
  deleteExpiredAuthAttemptBuckets: (...args: unknown[]) => cleanupAuth(...args),
}));
vi.mock("../../apps/worker/src/modules/ai/infrastructure/assistant-conversation-repository", () => ({
  deleteExpiredAssistantConversationTurns: (...args: unknown[]) => cleanupConversations(...args),
}));
vi.mock("../../apps/worker/src/modules/requests/infrastructure/request-retention-repository", () => ({
  createRequestRetentionRepository: vi.fn(() => "retention-repository"),
}));

import { handleScheduled } from "../../apps/worker/src/scheduled/handler";

describe("scheduled Worker jobs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs the opt-in Autopilot tick on the five-minute cron only", async () => {
    let scheduled: Promise<unknown> | undefined;
    const ctx = { waitUntil: (promise: Promise<unknown>) => { scheduled = promise; } };
    const env = { DB: {} };
    handleScheduled({ cron: "*/5 * * * *" } as ScheduledController, env as never, ctx as never);
    await scheduled;
    expect(runAutopilot).toHaveBeenCalledWith(env);
    expect(cleanupRequests).not.toHaveBeenCalled();
    expect(cleanupAuth).not.toHaveBeenCalled();
    expect(cleanupConversations).not.toHaveBeenCalled();
  });

  it("keeps retention and security cleanup on the daily cron", async () => {
    let scheduled: Promise<unknown> | undefined;
    const ctx = { waitUntil: (promise: Promise<unknown>) => { scheduled = promise; } };
    const env = { DB: {} };
    handleScheduled({ cron: "0 3 * * *" } as ScheduledController, env as never, ctx as never);
    await scheduled;
    expect(runAutopilot).not.toHaveBeenCalled();
    expect(cleanupRequests).toHaveBeenCalledOnce();
    expect(cleanupAuth).toHaveBeenCalledWith(env.DB);
    expect(cleanupConversations).toHaveBeenCalledWith(env.DB);
  });
});
