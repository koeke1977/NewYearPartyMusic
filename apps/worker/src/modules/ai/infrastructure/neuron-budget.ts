import type { AssistantNeuronUsageRepository } from "../application/neuron-budget-policy";

export type D1SettingsDatabase = Pick<D1Database, "prepare">;

/** D1 adapter for the application-owned daily AI usage repository. */
export function createD1AssistantNeuronUsageRepository(db: D1SettingsDatabase): AssistantNeuronUsageRepository {
  return {
    async readDailyUsage(usageKey) {
      const row = await db.prepare("SELECT value FROM settings WHERE key=?").bind(usageKey).first<{ value: string }>();
      return row?.value ?? null;
    },
    async addDailyUsage(usageKey, neurons) {
      await db.prepare(
        "INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) " +
        "ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(settings.value AS REAL)+CAST(excluded.value AS REAL) AS TEXT),updated_at=CURRENT_TIMESTAMP",
      ).bind(usageKey, String(neurons)).run();
    },
  };
}
