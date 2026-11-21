export type CrowdFeedback = { atmosphere: "good" | "neutral" | "bad"; energy: number };
export type CrowdFeedbackRepository = {
  save(input: { guestId: string; eventId: string; feedback: CrowdFeedback }): Promise<boolean>;
  readRecent(eventId: string, windowMinutes: number): Promise<Array<{ atmosphere: string; energy: number }>>;
};

export function validateCrowdFeedback(value: unknown): CrowdFeedback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!["good", "neutral", "bad"].includes(String(input.atmosphere))) return null;
  if (!Number.isInteger(input.energy) || Number(input.energy) < 1 || Number(input.energy) > 5) return null;
  return { atmosphere: input.atmosphere as CrowdFeedback["atmosphere"], energy: Number(input.energy) };
}

export async function submitCrowdFeedback(input: {
  repository: CrowdFeedbackRepository; guestId: string; eventId: string; feedback: unknown;
}) {
  const feedback = validateCrowdFeedback(input.feedback);
  if (!feedback) return { ok: false as const, reason: "invalid" as const };
  const saved = await input.repository.save({ guestId: input.guestId, eventId: input.eventId, feedback });
  if (!saved) return { ok: false as const, reason: "rate_limited" as const };
  return { ok: true as const };
}

export async function getCrowdFeedback(input: { repository: CrowdFeedbackRepository; eventId: string }) {
  const rows = await input.repository.readRecent(input.eventId, 30);
  const respondents = rows.length;
  if (respondents < 5) {
    return { eventId: input.eventId, eligible: false, respondents, minimumRespondents: 5, windowMinutes: 30,
      atmosphere: null, averageEnergy: null, trend: "insufficient" as const };
  }
  const atmosphere = { good: 0, neutral: 0, bad: 0 };
  let energyTotal = 0;
  for (const row of rows) {
    if (row.atmosphere in atmosphere) atmosphere[row.atmosphere as keyof typeof atmosphere] += 1;
    energyTotal += row.energy;
  }
  const averageEnergy = Number((energyTotal / respondents).toFixed(1));
  const negativeShare = atmosphere.bad / respondents;
  const positiveShare = atmosphere.good / respondents;
  const trend = negativeShare >= 0.6 ? "negative" : positiveShare >= 0.6 ? "positive" : "mixed";
  return { eventId: input.eventId, eligible: true, respondents, minimumRespondents: 5, windowMinutes: 30,
    atmosphere, averageEnergy, trend };
}
