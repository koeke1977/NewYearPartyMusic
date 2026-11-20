import { describe, expect, it } from "vitest";
import { extractDjTrackSuggestions } from "../../apps/web/modules/dj-ai-suggestions.js";

describe("DJ AI track suggestions", () => {
  it("extracts numbered title-artist suggestions and normalizes dash formatting", () => {
    expect(extractDjTrackSuggestions(
      "1. **Music Sounds Better With You** – Stardust\n2. Like a Prayer — Madonna (Single Version)\n3. Just a thought",
    )).toEqual([
      "Music Sounds Better With You — Stardust",
      "Like a Prayer — Madonna",
    ]);
  });

  it("falls back to Spotify query groups when no numbered tracks are present", () => {
    expect(extractDjTrackSuggestions("A short explanation", [{ query: "Madonna" }, { query: "Stardust" }]))
      .toEqual(["Madonna", "Stardust"]);
  });

  it("caps suggestions at twenty and each suggestion at 140 characters", () => {
    const answer = Array.from({ length: 25 }, (_, index) => (index + 1) + ". " + "X".repeat(150) + " — Artist").join("\n");
    const suggestions = extractDjTrackSuggestions(answer);
    expect(suggestions).toHaveLength(20);
    expect(suggestions.every((suggestion) => suggestion.length <= 140)).toBe(true);
  });
});
