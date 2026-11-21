export type FlushEventResult =
  | { ok: true; deleted: true }
  | { ok: false; error: "confirmation_required" | "invalid_code" | "not_configured" };

export interface EventFlushRepository {
  flushTemporaryEventData(eventId: string): Promise<void>;
}

/** Deletes only temporary data belonging to the active event after explicit DJ re-verification. */
export async function flushEvent(input: {
  eventId: string;
  confirmation: unknown;
  code: unknown;
  expectedCodeHash: string;
  repository: EventFlushRepository;
  hashCode(value: string): Promise<string>;
  constantTimeEqual(a: string, b: string): boolean;
}): Promise<FlushEventResult> {
  if (input.confirmation !== "FLUSH") return { ok: false, error: "confirmation_required" };
  if (!input.expectedCodeHash) return { ok: false, error: "not_configured" };
  if (typeof input.code !== "string" || !input.code || input.code.length > 64) {
    return { ok: false, error: "invalid_code" };
  }
  const suppliedHash = await input.hashCode(input.code);
  if (!input.constantTimeEqual(suppliedHash, input.expectedCodeHash.trim().toLowerCase())) {
    return { ok: false, error: "invalid_code" };
  }
  await input.repository.flushTemporaryEventData(input.eventId);
  return { ok: true, deleted: true };
}
