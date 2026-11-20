import type { GuestRequestDatabase } from "../infrastructure/guest-request-repository";
import { deleteExpiredCompletedRequests } from "../infrastructure/request-retention-repository";

export async function cleanupCompletedRequests(db: GuestRequestDatabase): Promise<void> {
  // Retain the existing 30-day policy and never purge live requests.
  await deleteExpiredCompletedRequests(db);
}
