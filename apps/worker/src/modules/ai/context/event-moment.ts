export type EventMoment = {
  belgianLocalTime: string;
  isNewYearsEve2026: boolean;
  minutesToMidnight: number | null;
  minutesAfterMidnight: number | null;
  phase: "after_midnight" | "rehearsal_or_non_event_day" | "early_evening" | "building_toward_midnight" | "countdown_peak_window_approaching" | "midnight_peak";
};

/**
 * Derives the New Year's Eve phase from Belgian local time.
 * The optional date is an explicit test seam; production defaults to the current time.
 */
export function buildEventMoment(now: Date = new Date()): EventMoment {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const localPart = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const localDate = localPart("year") + "-" + localPart("month") + "-" + localPart("day");
  const localHour = Number(localPart("hour"));
  const localMinute = Number(localPart("minute"));
  const isNewYearsEve = localDate === "2026-12-31";
  const isAfterMidnight = localDate === "2027-01-01" && localHour < 3;
  const roundedLocalMinute = Math.floor(localMinute / 15) * 15;
  const minutesToMidnight = isNewYearsEve
    ? Math.ceil((1440 - (localHour * 60 + roundedLocalMinute)) / 15) * 15
    : null;
  const minutesAfterMidnight = isAfterMidnight
    ? Math.floor((localHour * 60 + roundedLocalMinute) / 15) * 15
    : null;

  const phase: EventMoment["phase"] = isAfterMidnight
    ? "after_midnight"
    : !isNewYearsEve
      ? "rehearsal_or_non_event_day"
      : minutesToMidnight! > 240
        ? "early_evening"
        : minutesToMidnight! > 90
          ? "building_toward_midnight"
          : minutesToMidnight! > 15
            ? "countdown_peak_window_approaching"
            : "midnight_peak";

  return {
    belgianLocalTime: localDate + " " + localPart("hour") + ":" + String(roundedLocalMinute).padStart(2, "0") + " (rounded to 15 min)",
    isNewYearsEve2026: isNewYearsEve,
    minutesToMidnight,
    minutesAfterMidnight,
    phase,
  };
}
