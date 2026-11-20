import { describe, expect, it } from "vitest";
import { clearDjToken, getSavedDjToken, saveDjToken } from "../../apps/web/modules/dj-session.js";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("DJ browser session storage", () => {
  it("reads, saves and clears the existing partyqueue_dj_token key", () => {
    const storage = createStorage();
    expect(getSavedDjToken(storage)).toBe("");
    saveDjToken("session-token", storage);
    expect(storage.getItem("partyqueue_dj_token")).toBe("session-token");
    expect(getSavedDjToken(storage)).toBe("session-token");
    clearDjToken(storage);
    expect(getSavedDjToken(storage)).toBe("");
  });
});
