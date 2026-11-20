import type { GuestRequestDatabase } from "./guest-request-repository";

export async function deleteExpiredCompletedRequests(db: GuestRequestDatabase): Promise<void> {
  await db.prepare(
    "DELETE FROM requests WHERE requested_at < datetime('now','-30 days') AND status NOT IN ('pending','approved','queued')",
  ).run();
}
