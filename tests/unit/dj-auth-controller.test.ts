import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDjAuthController } from "../../apps/web/modules/dj-auth-controller.js";

const storage = new Map();
vi.mock("../../apps/web/modules/dj-session.js", () => ({
  clearDjToken: vi.fn(() => storage.delete("token")),
  getSavedDjToken: vi.fn(() => storage.get("token") || ""),
  saveDjToken: vi.fn(value => storage.set("token", value)),
}));

function form() {
  const handlers = {};
  const button = { disabled: false };
  return {
    handlers,
    button,
    addEventListener: (name, handler) => { handlers[name] = handler; },
    querySelector: () => button,
    reset: vi.fn(),
  };
}

describe("DJ auth controller", () => {
  beforeEach(() => storage.clear());

  it("logs in, persists the token and reveals the DJ console", async () => {
    const loginForm = form();
    const loginCard = { hidden: false };
    const consoleView = { hidden: true };
    const loginMessage = { textContent: "" };
    const onStateChange = vi.fn();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ token: "dj-session-token" }),
    }));
    class FakeFormData { get(key) { return key === "code" ? "1234" : null; } }
    const auth = createDjAuthController({
      loginCard, loginForm, loginMessage, consoleView, onStateChange, fetchImpl, FormDataImpl: FakeFormData,
    });

    await loginForm.handlers.submit({ preventDefault: vi.fn() });

    expect(auth.getToken()).toBe("dj-session-token");
    expect(storage.get("token")).toBe("dj-session-token");
    expect(loginForm.reset).toHaveBeenCalledOnce();
    expect(loginCard.hidden).toBe(true);
    expect(consoleView.hidden).toBe(false);
    expect(onStateChange).toHaveBeenCalledWith(true);
    expect(loginForm.button.disabled).toBe(false);
  });

  it("keeps the login form visible and reports a rejected login", async () => {
    const loginForm = form();
    const loginMessage = { textContent: "" };
    const auth = createDjAuthController({
      loginCard: { hidden: false },
      loginForm,
      loginMessage,
      consoleView: { hidden: true },
      fetchImpl: async () => ({ ok: false, json: async () => ({ error: "Wrong code" }) }),
      FormDataImpl: class { get() { return "bad"; } },
    });

    await loginForm.handlers.submit({ preventDefault: vi.fn() });

    expect(auth.getToken()).toBe("");
    expect(loginMessage.textContent).toBe("Wrong code");
  });

  it("clears the persisted token and invalidates the logged-in state on logout", () => {
    storage.set("token", "existing");
    const onStateChange = vi.fn();
    const auth = createDjAuthController({
      loginCard: { hidden: true },
      loginForm: form(),
      loginMessage: { textContent: "" },
      consoleView: { hidden: false },
      onStateChange,
    });

    auth.logout();

    expect(auth.hasToken()).toBe(false);
    expect(storage.has("token")).toBe(false);
    expect(onStateChange).toHaveBeenCalledWith(false);
  });
});
