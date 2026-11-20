import type { AuthAttemptScope } from "../domain/auth-attempt-policy";

export type AuthAttemptDatabase = Pick<D1Database, "prepare">;

/**
 * Atomically consumes one attempt from a per-IP sliding bucket.
 * A null RETURNING row means the threshold was already reached.
 */
export async function consumeAuthAttempt(
  db: AuthAttemptDatabase,
  scope: AuthAttemptScope,
  ipHash: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<boolean> {
  const windowModifier = "-" + Math.max(1, Math.floor(windowSeconds)) + " seconds";
  const row = await db.prepare(
    "INSERT INTO auth_attempt_buckets (scope,ip_hash,window_started_at,attempt_count) VALUES (?,?,CURRENT_TIMESTAMP,1) " +
    "ON CONFLICT(scope,ip_hash) DO UPDATE SET " +
    "window_started_at = CASE WHEN auth_attempt_buckets.window_started_at <= datetime('now', ?) THEN CURRENT_TIMESTAMP ELSE auth_attempt_buckets.window_started_at END, " +
    "attempt_count = CASE WHEN auth_attempt_buckets.window_started_at <= datetime('now', ?) THEN 1 ELSE auth_attempt_buckets.attempt_count + 1 END " +
    "WHERE auth_attempt_buckets.window_started_at <= datetime('now', ?) OR auth_attempt_buckets.attempt_count < ? " +
    "RETURNING attempt_count",
  ).bind(scope, ipHash, windowModifier, windowModifier, windowModifier, maxAttempts)
    .first<{ attempt_count: number }>();
  return row !== null;
}

export async function deleteExpiredAuthAttemptBuckets(db: AuthAttemptDatabase): Promise<void> {
  await db.prepare(
    "DELETE FROM auth_attempt_buckets WHERE window_started_at < datetime('now','-1 day')",
  ).run();
}
