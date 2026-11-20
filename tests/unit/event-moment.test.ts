import { describe, expect, it } from "vitest";
import { buildEventMoment } from "../../apps/worker/src/modules/ai/context/event-moment";

describe("Belgian New Year's Eve event moment", () => {
  it("uses Europe/Brussels local time and rounds down to 15 minutes", () => {
    const moment = buildEventMoment(new Date("2026-12-31T20:37:00.000Z"));
    expect(moment.belgianLocalTime).toBe("2026-12-31 21:30 (rounded to 15 min)");
    expect(moment.minutesToMidnight).toBe(150);
    expect(moment.phase).toBe("building_toward_midnight");
  });

  it("classifies the early-evening warm-up window", () => {
    const moment = buildEventMoment(new Date("2026-12-31T17:00:00.000Z"));
    expect(moment.minutesToMidnight).toBe(360);
    expect(moment.phase).toBe("early_evening");
  });

  it("classifies the final countdown build window", () => {
    const moment = buildEventMoment(new Date("2026-12-31T22:00:00.000Z"));
    expect(moment.minutesToMidnight).toBe(60);
    expect(moment.phase).toBe("countdown_peak_window_approaching");
  });

  it("classifies the final 15-minute midnight peak", () => {
    const moment = buildEventMoment(new Date("2026-12-31T22:45:00.000Z"));
    expect(moment.minutesToMidnight).toBe(15);
    expect(moment.phase).toBe("midnight_peak");
  });

  it("tracks the first three hours after midnight in Belgian local time", () => {
    const moment = buildEventMoment(new Date("2027-01-01T00:30:00.000Z"));
    expect(moment.belgianLocalTime).toBe("2027-01-01 01:30 (rounded to 15 min)");
    expect(moment.minutesAfterMidnight).toBe(90);
    expect(moment.phase).toBe("after_midnight");
  });

  it("does not force a countdown arc on a rehearsal or non-event day", () => {
    const moment = buildEventMoment(new Date("2026-12-30T12:00:00.000Z"));
    expect(moment.isNewYearsEve2026).toBe(false);
    expect(moment.minutesToMidnight).toBeNull();
    expect(moment.minutesAfterMidnight).toBeNull();
    expect(moment.phase).toBe("rehearsal_or_non_event_day");
  });
});
