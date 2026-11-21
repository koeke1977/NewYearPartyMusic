import { describe, expect, it } from "vitest";
import { resolveDjAiPrompt } from "../../apps/web/modules/dj-ai-intent.js";

describe("DJ AI prompt intent", () => {
  it("recognizes explicit reorder instructions", () => {
    const result = resolveDjAiPrompt("Zet de wachtrij in een andere volgorde");
    expect(result.mode).toBe("optimize");
    expect(result.prompt).toContain("alle bestaande tracks exact één keer");
  });

  it("imports an explicitly numbered track list unchanged", () => {
    const source = "Voeg deze lijst toe aan UP NEXT:\n1. Track A — Artist A\n2. Track B — Artist B";
    expect(resolveDjAiPrompt(source)).toEqual({
      mode: "import",
      prompt: "1. Track A — Artist A\n2. Track B — Artist B",
    });
  });

  it("treats a follow-up asking to put the previous full list in UP NEXT as import, not reorder", () => {
    const result = resolveDjAiPrompt(
      "Zet die volledig in UP NEXT",
      "Hier zijn de suggesties:\n1. Gasolina — Daddy Yankee\n2. Danza Kuduro — Don Omar",
    );
    expect(result).toEqual({
      mode: "import",
      prompt: "1. Gasolina — Daddy Yankee\n2. Danza Kuduro — Don Omar",
    });
  });

  it("recovers a numbered list from the previous AI answer using real line breaks", () => {
    const result = resolveDjAiPrompt(
      "Voeg die lijst toe aan de wachtrij",
      "1. Track A — Artist A\n2. Track B — Artist B",
    );
    expect(result.mode).toBe("import");
    expect(result.prompt.split("\n")).toHaveLength(2);
  });

  it("turns a specific track request into a constrained suggestion request", () => {
    const result = resolveDjAiPrompt("Voeg Daft Punk toe aan UP NEXT");
    expect(result.mode).toBe("fill");
    expect(result.prompt).toContain("Voeg geen andere suggesties toe");
  });

  it("keeps ordinary musical questions in advice mode and ignores empty input", () => {
    expect(resolveDjAiPrompt("Wat past hierna?")).toEqual({
      mode: "advice",
      prompt: "Wat past hierna?",
    });
    expect(resolveDjAiPrompt("  ")).toBeNull();
  });
});
