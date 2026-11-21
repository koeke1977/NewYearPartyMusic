import { describe, expect, it, vi } from "vitest";
import { getCrowdFeedback, submitCrowdFeedback, validateCrowdFeedback } from "../../apps/worker/src/modules/music/application/crowd-feedback";

describe("event-scoped crowd feedback", () => {
  it("accepts only a known atmosphere and integer energy from 1 to 5", () => {
    expect(validateCrowdFeedback({ atmosphere: "good", energy: 4 })).toEqual({ atmosphere: "good", energy: 4 });
    expect(validateCrowdFeedback({ atmosphere: "angry", energy: 4 })).toBeNull();
    expect(validateCrowdFeedback({ atmosphere: "good", energy: 6 })).toBeNull();
    expect(validateCrowdFeedback({ atmosphere: "good", energy: 2.5 })).toBeNull();
  });

  it("stores a single current event-scoped response and surfaces rate limiting", async () => {
    const save = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const repository = { save, readRecent: vi.fn().mockResolvedValue([]) };
    const input = { repository, guestId: "guest-1", eventId: "NYE2026", feedback: { atmosphere: "good", energy: 4 } };
    expect(await submitCrowdFeedback(input)).toEqual({ ok: true });
    expect(await submitCrowdFeedback(input)).toEqual({ ok: false, reason: "rate_limited" });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledWith({ guestId: "guest-1", eventId: "NYE2026", feedback: { atmosphere: "good", energy: 4 } });
  });

  it("does not expose a trend before five recent guests have responded", async () => {
    const result = await getCrowdFeedback({
      eventId: "NYE2026",
      repository: { save: vi.fn(), readRecent: vi.fn().mockResolvedValue([
        { atmosphere: "bad", energy: 1 }, { atmosphere: "bad", energy: 2 }, { atmosphere: "good", energy: 4 }, { atmosphere: "neutral", energy: 3 },
      ]) },
    });
    expect(result).toMatchObject({ eligible: false, respondents: 4, trend: "insufficient", atmosphere: null, averageEnergy: null });
  });

  it("detects sustained negative atmosphere from the rolling 30-minute sample", async () => {
    const result = await getCrowdFeedback({
      eventId: "NYE2026",
      repository: { save: vi.fn(), readRecent: vi.fn().mockResolvedValue([
        { atmosphere: "bad", energy: 1 }, { atmosphere: "bad", energy: 2 }, { atmosphere: "bad", energy: 2 },
        { atmosphere: "good", energy: 4 }, { atmosphere: "neutral", energy: 3 },
      ]) },
    });
    expect(result).toMatchObject({
      eligible: true, respondents: 5, trend: "negative",
      atmosphere: { good: 1, neutral: 1, bad: 3 }, averageEnergy: 2.4, windowMinutes: 30,
    });
  });

  it("does not call a trend positive unless at least 60 percent report good atmosphere", async () => {
    const result = await getCrowdFeedback({
      eventId: "NYE2026",
      repository: { save: vi.fn(), readRecent: vi.fn().mockResolvedValue([
        { atmosphere: "good", energy: 4 }, { atmosphere: "good", energy: 4 }, { atmosphere: "neutral", energy: 3 },
        { atmosphere: "bad", energy: 2 }, { atmosphere: "neutral", energy: 3 },
      ]) },
    });
    expect(result.trend).toBe("mixed");
  });
});
