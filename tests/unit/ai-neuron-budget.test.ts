import { describe, expect, it, vi } from "vitest";
import {
  ASSISTANT_MAX_OUTPUT_TOKENS,
  DAILY_ASSISTANT_NEURON_BUDGET,
  createDailyAssistantNeuronBudget,
  estimateAssistantNeurons,
  getAssistantNeuronUsageKey,
} from "../../apps/worker/src/modules/ai/infrastructure/neuron-budget";

function fakeDb(storedValue = "0") {
  const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
  const first = vi.fn().mockResolvedValue({ value: storedValue });
  const bind = vi.fn().mockReturnValue({ first, run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { db: { prepare } as never, prepare, bind, first, run };
}

describe("AI daily Neuron budget", () => {
  it("uses the UTC date in the daily usage key", () => {
    expect(getAssistantNeuronUsageKey(new Date("2026-12-31T23:30:00.000Z"))).toBe("dj_ai_neurons_2026-12-31");
  });

  it("keeps the conservative 1.5x estimate and the 7,500 Neuron cap", () => {
    expect(estimateAssistantNeurons(3000, ASSISTANT_MAX_OUTPUT_TOKENS)).toBeGreaterThan(0);
    expect(DAILY_ASSISTANT_NEURON_BUDGET).toBe(7500);
  });

  it("loads today's usage and blocks a call that would exceed the budget", async () => {
    const { db, first } = fakeDb("7497");
    const budget = await createDailyAssistantNeuronBudget(db, new Date("2026-12-31T12:00:00.000Z"));
    expect(first).toHaveBeenCalledWith();
    expect(budget.currentEstimatedNeurons()).toBe(7497);
    expect(budget.canAfford(1000, 1400)).toBe(false);
  });

  it("records provider usage and updates the in-memory estimate", async () => {
    const { db, prepare, run } = fakeDb("100");
    const budget = await createDailyAssistantNeuronBudget(db, new Date("2026-12-31T12:00:00.000Z"));
    const estimate = await budget.record(
      { usage: { prompt_tokens: 1000, completion_tokens: 500 } },
      3000,
      1400,
    );
    expect(estimate).toBe(estimateAssistantNeurons(3000, 500));
    expect(budget.currentEstimatedNeurons()).toBe(100 + estimate);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("falls back to input/output estimates when provider usage is missing", async () => {
    const { db } = fakeDb("0");
    const budget = await createDailyAssistantNeuronBudget(db, new Date("2026-12-31T12:00:00.000Z"));
    const estimate = await budget.record({ response: "ok" }, 3000, 1400);
    expect(estimate).toBe(estimateAssistantNeurons(3000, 1400));
  });

  it("does not count negative or invalid stored usage", async () => {
    const { db } = fakeDb("-20");
    const budget = await createDailyAssistantNeuronBudget(db, new Date("2026-12-31T12:00:00.000Z"));
    expect(budget.currentEstimatedNeurons()).toBe(0);
  });
});
