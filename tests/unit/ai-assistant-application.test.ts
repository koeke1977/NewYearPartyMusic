import { describe, expect, it, vi } from "vitest";
import { executeDJAssistant } from "../../apps/worker/src/modules/ai/application/execute-dj-assistant";

function createBudgetExhaustedEnv() {
  const statements: string[] = [];
  const prepare = vi.fn((sql: string) => {
    statements.push(sql);
    let values: unknown[] = [];
    const statement = {
      bind: (...args: unknown[]) => { values = args; return statement; },
      all: async () => ({ results: [] }),
      first: async () => {
        if (values[0] && String(values[0]).startsWith("dj_ai_neurons_")) return { value: "7500" };
        return null;
      },
      run: async () => ({ meta: { changes: 1 } }),
    };
    return statement;
  });
  return {
    env: {
      DB: { prepare } as never,
      EVENT_ID: "event-1",
      EVENT_NAME: "Test Party",
      AI: { run: vi.fn() },
    } as never,
    statements,
    prepare,
  };
}

describe("executeDJAssistant", () => {
  it("stops at the free-tier budget before cooldown or provider invocation", async () => {
    const { env, statements } = createBudgetExhaustedEnv();
    const result = await executeDJAssistant(env, "Geef me wat disco-advies");
    expect(result.status).toBe(429);
    expect(result.body.error).toContain("veilige dagbudget");
    expect(statements.some(sql => sql.includes("dj_ai_last_request"))).toBe(false);
    expect((env as any).AI.run).not.toHaveBeenCalled();
  });
});
