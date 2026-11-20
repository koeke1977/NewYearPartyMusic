import { afterEach, describe, expect, it, vi } from "vitest";
import { clearGuestSession, getSavedSession, saveGuestSession } from "../../apps/web/modules/guest-session.js";

const values = new Map();
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};

describe("guest session storage", () => {
  afterEach(() => {
    values.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("persists and restores a valid guest session", () => {
    vi.stubGlobal("localStorage", storage);
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const session = {
      token: "guest-token",
      guest: { nickname: "Disco Guest" },
      expiresAt: 1_800_000_100,
    };

    saveGuestSession(session);

    expect(getSavedSession()).toEqual(session);
    expect(values.has("partyqueue_session")).toBe(true);
  });

  it("removes an expired session instead of restoring it", () => {
    vi.stubGlobal("localStorage", storage);
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    values.set("partyqueue_session", JSON.stringify({
      token: "expired-token",
      guest: { nickname: "Guest" },
      expiresAt: 1_799_999_999,
    }));

    expect(getSavedSession()).toBeNull();
    expect(values.has("partyqueue_session")).toBe(false);
  });

  it("clears the existing session key on logout", () => {
    vi.stubGlobal("localStorage", storage);
    values.set("partyqueue_session", "stored");

    clearGuestSession();

    expect(values.has("partyqueue_session")).toBe(false);
  });
});
