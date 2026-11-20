import { describe, expect, it } from "vitest";
import { parseDJPreferences, rememberDJPreference } from "../../apps/worker/src/modules/ai/memory/dj-preferences";

describe("DJ preference memory", () => {
  it("only stores a preference when the DJ explicitly asks", () => {
    expect(rememberDJPreference('["disco"]', "Speel straks wat rock.")).toEqual({
      preferences: ["disco"],
      updated: false,
    });
    expect(rememberDJPreference('["disco"]', "Onthoud dat ik graag disco hoor.")).toEqual({
      preferences: ["disco", "Onthoud dat ik graag disco hoor."],
      updated: true,
    });
  });

  it("does not duplicate an identical preference", () => {
    expect(rememberDJPreference('["Onthoud disco"]', "Onthoud disco")).toEqual({
      preferences: ["Onthoud disco"],
      updated: false,
    });
  });

  it("keeps the most recent twenty preferences and caps each entry", () => {
    const stored = JSON.stringify(Array.from({ length: 20 }, (_, index) => "p" + index));
    const result = rememberDJPreference(stored, "Onthoud " + "x".repeat(300));
    expect(result.preferences).toHaveLength(20);
    expect(result.preferences[0]).toBe("p1");
    expect(result.preferences[19]).toHaveLength(240);
  });

  it("recovers safely from malformed or unexpected stored JSON", () => {
    expect(parseDJPreferences("{broken")).toEqual([]);
    expect(parseDJPreferences('{"not":"an array"}')).toEqual([]);
    expect(parseDJPreferences('[1,"rock",null]')).toEqual(["rock"]);
  });
});
