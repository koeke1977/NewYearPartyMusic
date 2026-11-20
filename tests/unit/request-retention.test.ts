import { describe, expect, it, vi } from "vitest";
import { cleanupCompletedRequests } from "../../apps/worker/src/modules/requests/application/cleanup-completed-requests";

describe("completed request retention", () => {
 it("delegates cleanup to its repository port", async () => {
  const deleteExpiredCompletedRequests=vi.fn(async()=>{});
  await cleanupCompletedRequests({deleteExpiredCompletedRequests});
  expect(deleteExpiredCompletedRequests).toHaveBeenCalledOnce();
 });
});
