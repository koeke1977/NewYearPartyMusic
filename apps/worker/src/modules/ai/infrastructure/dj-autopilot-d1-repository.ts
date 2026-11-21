import { loadAssistantContextSnapshot } from "./assistant-context-repository";\nimport { claimAssistantRateLimit } from "./assistant-settings-repository";

export type DJAutopilotDatabase = Pick<D1Database, "prepare">;

/** D1-backed opt-in switch, stale-safe lease and retry cooldown for the scheduled DJ Autopilot. */
export function createDJAutopilotRepository(db: DJAutopilotDatabase) {
  const settingKey = (name: string, eventId: string) => "dj_autopilot_" + name + "_" + eventId;
  return {
    claimRateLimit: () => claimAssistantRateLimit(db as never),\n    async isEnabled(_eventId: string): Promise<boolean> {
      const row = await db.prepare("SELECT value FROM settings WHERE key=?")
        .bind("ai_autopilot").first<{ value: string }>();
      return row?.value === "true";
    },
    async acquireLock(eventId: string, nowEpochSeconds: number): Promise<boolean> {
      const result = await db.prepare(
        "INSERT INTO settings (key,value,updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP " +
        "WHERE CAST(settings.value AS INTEGER) < ?",
      ).bind(settingKey("lock", eventId), String(nowEpochSeconds), String(nowEpochSeconds - 180)).run();
      return Number(result.meta?.changes || 0) > 0;
    },
    async releaseLock(eventId: string, lockEpochSeconds: number): Promise<void> {
      await db.prepare("UPDATE settings SET value='0',updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?")
        .bind(settingKey("lock", eventId), String(lockEpochSeconds)).run();
    },
    loadContext: (eventId: string) => loadAssistantContextSnapshot(db, eventId),
    async readLastFailedAttempt(eventId: string): Promise<number> {
      const row = await db.prepare("SELECT value FROM settings WHERE key=?")
        .bind(settingKey("last_failed", eventId)).first<{ value: string }>();
      return Math.max(0, Number(row?.value) || 0);
    },
    async recordFailedAttempt(eventId: string, nowEpochSeconds: number): Promise<void> {
      await db.prepare(
        "INSERT INTO settings (key,value,updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) " +
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
      ).bind(settingKey("last_failed", eventId), String(nowEpochSeconds)).run();
    },
  };
}
