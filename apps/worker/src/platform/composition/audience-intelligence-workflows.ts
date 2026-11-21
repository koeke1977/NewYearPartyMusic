import type { Env } from "../env";
import { getAudienceIntelligence } from "../../modules/music/application/get-audience-intelligence";
import { createAudienceIntelligenceRepository } from "../../modules/music/infrastructure/audience-intelligence-d1-repository";

export function getAudienceIntelligenceFromEnvironment(env: Env) {
  return getAudienceIntelligence({
    repository: createAudienceIntelligenceRepository(env.DB),
    eventId: env.EVENT_ID,
  });
}
