import { describe, expect, it, vi } from "vitest";
import { flushEvent } from "../../apps/worker/src/modules/events/application/flush-event";

describe("flushEvent", () => {
  const base = {
    eventId: "NYE2026",
    expectedCodeHash: "valid-hash",
    repository: { flushTemporaryEventData: vi.fn(async () => {}) },
    hashCode: vi.fn(async (value: string) => value === "correct" ? "valid-hash" : "wrong-hash"),
    constantTimeEqual: (a: string, b: string) => a === b,
  };

  it("requires the exact explicit confirmation before touching data", async () => {
    const result = await flushEvent({ ...base, confirmation: "yes", code: "correct" });
    expect(result).toEqual({ ok: false, error: "confirmation_required" });
    expect(base.repository.flushTemporaryEventData).not.toHaveBeenCalled();
  });

  it("requires the DJ access code to be re-entered correctly", async () => {
    const result = await flushEvent({ ...base, confirmation: "FLUSH", code: "wrong" });
    expect(result).toEqual({ ok: false, error: "invalid_code" });
    expect(base.repository.flushTemporaryEventData).not.toHaveBeenCalled();
  });

  it("flushes the event only after confirmation and code verification", async () => {
    const result = await flushEvent({ ...base, confirmation: "FLUSH", code: "correct" });
    expect(result).toEqual({ ok: true, deleted: true });
    expect(base.repository.flushTemporaryEventData).toHaveBeenCalledWith("NYE2026");
  });

  it("fails closed when DJ access is not configured", async () => {
    const result = await flushEvent({ ...base, expectedCodeHash: "", confirmation: "FLUSH", code: "correct" });
    expect(result).toEqual({ ok: false, error: "not_configured" });
    expect(base.repository.flushTemporaryEventData).not.toHaveBeenCalled();
  });
});
