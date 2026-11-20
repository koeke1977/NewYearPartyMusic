import { describe, expect, it, vi } from "vitest";
import { createGuestJoinController } from "../../apps/web/modules/guest-join-controller.js";

function setup({ values = {}, response, fetchImpl } = {}) {
  let submitHandler;
  const form = {
    addEventListener: vi.fn((event, handler) => {
      if (event === "submit") submitHandler = handler;
    }),
  };
  const message = { textContent: "" };
  const card = {};
  const submitButton = { disabled: false, textContent: "IK DOE MEE ↗" };
  const showMusicSearch = vi.fn();
  const saveGuestSession = vi.fn();
  const FormDataCtor = vi.fn(function FormDataMock() { return { get: key => values[key] }; });
  const request = fetchImpl || vi.fn(async () => response);
  createGuestJoinController({
    form, message, card, submitButton, showMusicSearch, saveGuestSession,
    fetchImpl: request, FormDataCtor,
  });
  return {
    submit: () => submitHandler({ preventDefault: vi.fn() }),
    form, message, card, submitButton, showMusicSearch, saveGuestSession,
    FormDataCtor, fetchImpl: request,
  };
}

describe("guest join controller", () => {
  it("rejects invalid nickname and missing event code before making a request", async () => {
    const app = setup({ values: { nickname: "A", eventCode: "" } });

    await app.submit();

    expect(app.message.textContent).toBe("Vul een nickname (2–24 tekens) en de feestcode in.");
    expect(app.fetchImpl).not.toHaveBeenCalled();
    expect(app.submitButton.disabled).toBe(false);
  });

  it("posts the existing join contract and hands the returned session to the guest view", async () => {
    const payload = {
      sessionToken: "signed-guest-token",
      guest: { id: "guest-1", nickname: "Disco Guest" },
      expiresAt: 123456,
    };
    const app = setup({
      values: { nickname: "  Disco Guest  ", eventCode: " PARTY " },
      response: { ok: true, json: async () => payload },
    });

    await app.submit();

    expect(app.fetchImpl).toHaveBeenCalledWith("/api/guests/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "Disco Guest", eventCode: "PARTY" }),
    });
    const session = { token: payload.sessionToken, guest: payload.guest, expiresAt: payload.expiresAt };
    expect(app.saveGuestSession).toHaveBeenCalledWith(session);
    expect(app.showMusicSearch).toHaveBeenCalledWith(app.card, session);
    expect(app.submitButton.disabled).toBe(true);
  });

  it("restores the submit button and displays the server error when joining fails", async () => {
    const app = setup({
      values: { nickname: "Disco Guest", eventCode: "PARTY" },
      response: { ok: false, json: async () => ({ error: "Invalid event code" }) },
    });

    await app.submit();

    expect(app.message.textContent).toBe("Invalid event code");
    expect(app.submitButton.disabled).toBe(false);
    expect(app.submitButton.textContent).toBe("IK DOE MEE ↗");
    expect(app.saveGuestSession).not.toHaveBeenCalled();
    expect(app.showMusicSearch).not.toHaveBeenCalled();
  });
});
