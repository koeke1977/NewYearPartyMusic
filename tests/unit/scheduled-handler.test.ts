import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAutopilot: vi.fn(async () => ({ status: "disabled", queued: 0 })),
  cleanupRequests: vi.fn(async () => {}),
  cleanupAuth: vi.fn(async () => {}),
  cleanupConversations: vi.fn(async () => {}),
}));

vi.mock("../../apps/worker/src/platform/composition/dj-autopilot", () => ({
  runDJAutopilotFromEnvironment: (...args: unknown[]) => mocks.runAutopilot(...args),
}));
vi.mock("../../apps/worker/src/modules/requests/application/cleanup-completed-requests", () => ({
  cleanupCompletedRequests: (...args: unknown[]) => mocks.cleanupRequests(...args),
}));
vi.mock("../../apps/worker/src/platform/infrastructure/auth-attempt-d1-repository", () => ({
  deleteExpiredAuthAttemptBuckets: (...args: unknown[]) => mocks.cleanupAuth(...args),
}));
vi.mock("../../apps/worker/src/modules/ai/infrastructure/assistant-conversation-repository", () => ({
  deleteExpiredAssistantConversationTurns: (...args: unknown[]) => mocks.cleanupConversations(...args),
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
    expect(mocks.runAutopilot).toHaveBeenCalledWith(env);
    expect(mocks.cleanupRequests).not.toHaveBeenCalled();
    expect(mocks.cleanupAuth).not.toHaveBeenCalled();
    expect(mocks.cleanupConversations).not.toHaveBeenCalled();
  });

  it("keeps retention and security cleanup on the daily cron", async () => {
    let scheduled: Promise<unknown> | undefined;
    const ctx = { waitUntil: (promise: Promise<unknown>) => { scheduled = promise; } };
    const env = { DB: {} };
    handleScheduled({ cron: "0 3 * * *" } as ScheduledController, env as never, ctx as never);
    await scheduled;
    expect(mocks.runAutopilot).not.toHaveBeenCalled();
    expect(mocks.cleanupRequests).toHaveBeenCalledOnce();
    expect(mocks.cleanupAuth).toHaveBeenCalledWith(env.DB);
    expect(mocks.cleanupConversations).toHaveBeenCalledWith(env.DB);
  });
});
