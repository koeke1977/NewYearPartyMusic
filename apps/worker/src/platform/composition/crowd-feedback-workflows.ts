import type { Env } from "../env";
import { getCrowdFeedback, submitCrowdFeedback } from "../../modules/music/application/crowd-feedback";
import { createCrowdFeedbackRepository } from "../../modules/music/infrastructure/crowd-feedback-d1-repository";

export function submitCrowdFeedbackFromEnvironment(env: Env, guestId: string, feedback: unknown) {
  return submitCrowdFeedback({ repository: createCrowdFeedbackRepository(env.DB), guestId, eventId: env.EVENT_ID, feedback });
}

export function getCrowdFeedbackFromEnvironment(env: Env) {
  return getCrowdFeedback({ repository: createCrowdFeedbackRepository(env.DB), eventId: env.EVENT_ID });
}
