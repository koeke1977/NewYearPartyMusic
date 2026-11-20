import { describe, expect, it, vi } from "vitest";
import {
 ASSISTANT_MAX_OUTPUT_TOKENS, DAILY_ASSISTANT_NEURON_BUDGET, createDailyAssistantNeuronBudget,
 estimateAssistantNeurons, getAssistantNeuronUsageKey,
} from "../../apps/worker/src/modules/ai/application/neuron-budget-policy";
import type { AssistantNeuronUsageRepository } from "../../apps/worker/src/modules/ai/application/neuron-budget-policy";

function fakeRepository(storedValue="0") {
 const addDailyUsage=vi.fn(async()=>{});
 const readDailyUsage=vi.fn(async()=>storedValue);
 const repository: AssistantNeuronUsageRepository={readDailyUsage,addDailyUsage};
 return {repository,readDailyUsage,addDailyUsage};
}

describe("AI daily Neuron budget",()=>{
 it("uses the UTC date in the daily usage key",()=>{expect(getAssistantNeuronUsageKey(new Date("2026-12-31T23:30:00.000Z"))).toBe("dj_ai_neurons_2026-12-31");});
 it("keeps the conservative 1.5x estimate and 7,500 Neuron cap",()=>{expect(estimateAssistantNeurons(3000,ASSISTANT_MAX_OUTPUT_TOKENS)).toBeGreaterThan(0);expect(DAILY_ASSISTANT_NEURON_BUDGET).toBe(7500);});
 it("loads today's usage and blocks calls that exceed the budget",async()=>{const {repository,readDailyUsage}=fakeRepository("7497");const budget=await createDailyAssistantNeuronBudget(repository,new Date("2026-12-31T12:00:00.000Z"));expect(readDailyUsage).toHaveBeenCalledWith("dj_ai_neurons_2026-12-31");expect(budget.currentEstimatedNeurons()).toBe(7497);expect(budget.canAfford(1000,1400)).toBe(false);});
 it("records provider usage and updates the in-memory estimate",async()=>{const {repository,addDailyUsage}=fakeRepository("100");const budget=await createDailyAssistantNeuronBudget(repository,new Date("2026-12-31T12:00:00.000Z"));const estimate=await budget.record({usage:{prompt_tokens:1000,completion_tokens:500}},3000,1400);expect(estimate).toBe(estimateAssistantNeurons(3000,500));expect(budget.currentEstimatedNeurons()).toBe(100+estimate);expect(addDailyUsage).toHaveBeenCalledWith("dj_ai_neurons_2026-12-31",estimate);});
 it("falls back to input/output estimates when provider usage is missing",async()=>{const {repository}=fakeRepository();const budget=await createDailyAssistantNeuronBudget(repository,new Date("2026-12-31T12:00:00.000Z"));expect(await budget.record({response:"ok"},3000,1400)).toBe(estimateAssistantNeurons(3000,1400));});
 it("does not count negative or invalid stored usage",async()=>{const {repository}=fakeRepository("-20");const budget=await createDailyAssistantNeuronBudget(repository,new Date("2026-12-31T12:00:00.000Z"));expect(budget.currentEstimatedNeurons()).toBe(0);});
});
