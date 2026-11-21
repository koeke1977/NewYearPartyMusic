import type { Env } from "../env";
import { constantTimeEqual } from "../security/crypto";
import { sha256 } from "../security/crypto";
import { flushEvent } from "../../modules/events/application/flush-event";
import { createEventFlushRepository } from "../../modules/events/infrastructure/event-flush-d1-repository";

export function flushEventFromEnvironment(env: Env, confirmation: unknown, code: unknown) {
  return flushEvent({
    eventId: env.EVENT_ID,
    confirmation,
    code,
    expectedCodeHash: env.DJ_ACCESS_CODE_HASH,
    repository: createEventFlushRepository(env.DB),
    hashCode: sha256,
    constantTimeEqual,
  });
}
