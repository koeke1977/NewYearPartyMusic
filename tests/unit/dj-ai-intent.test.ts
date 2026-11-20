import { describe, expect, it } from "vitest";
import { resolveDjAiPrompt } from "../../apps/web/modules/dj-ai-intent.js";

describe("DJ AI prompt intent", () => {
  it("turns queue reorder language into general set planning without queue metadata", () => {
    const result = resolveDjAiPrompt("Zet de wachtrij in een andere volgorde");
    expect(result.mode).toBe("advice");
    expect(result.prompt).toContain("geen live wachtrij of Spotify-trackmetadata");
    expect(result.prompt).toContain("verzin geen bestaande trackvolgorde");
  });

  it("imports an explicitly numbered track list unchanged for separate Spotify lookup", () => {
    const source = "Voeg deze lijst toe:\n1. Track A — Artist A\n2. Track B — Artist B";
    expect(resolveDjAiPrompt(source)).toEqual({ mode: "import", prompt: source });
  });

  it("recovers a numbered list from the previous AI answer using real line breaks", () => {
    const result = resolveDjAiPrompt(
      "Voeg die lijst toe aan de wachtrij",
      "1. Track A — Artist A\n2. Track B — Artist B",
    );
    expect(result.mode).toBe("import");
    expect(result.prompt).toBe("1. Track A — Artist A\n2. Track B — Artist B");
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
