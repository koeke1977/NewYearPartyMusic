import type { CompletedRequestRetentionRepository } from "./request-retention-ports";

export async function cleanupCompletedRequests(repository: CompletedRequestRetentionRepository): Promise<void> {
  // Retain the existing 30-day policy and never purge live requests.
  await repository.deleteExpiredCompletedRequests();
}
