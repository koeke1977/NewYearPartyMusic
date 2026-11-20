import type { QueueDispatchDatabase, QueuedPartyQueueRequest } from "../infrastructure/queue-dispatch-repository";
import {
  claimQueueDispatchLock,
  listQueuedPartyQueueRequests,
  markPartyQueueFallbackInactive,
  markPartyQueueRequestPlayed,
  readSavedPartyQueueOrder,
  releaseQueueDispatchLock,
  saveLastPartyQueueTrack,
} from "../infrastructure/queue-dispatch-repository";

export type QueueDispatchResult = {
  ok: boolean;
  busy?: boolean;
  track?: { name: string; artist: string };
  requestId?: string;
  error?: string;
};

type DispatchNextTrackDependencies = {
  db: QueueDispatchDatabase;
  eventId: string;
  playTrack: (trackUri: string) => Promise<{ ok: boolean; status: number }>;
  createOwner?: () => string;
  now?: () => number;
};

/**
 * Owns the critical dispatch sequence as one application workflow:
 * lease -> select -> Spotify play -> conditional status transition -> playback state -> release.
 */
export async function dispatchNextTrack({
  db,
  eventId,
  playTrack,
  createOwner = () => crypto.randomUUID(),
  now = () => Date.now(),
}: DispatchNextTrackDependencies): Promise<QueueDispatchResult> {
  const owner = createOwner();
  const acquired = await claimQueueDispatchLock(db, owner);
  if (!acquired) return { ok: false, busy: true, error: "Een andere NEXT-actie wordt al verwerkt." };

  try {
    const [queued, order] = await Promise.all([
      listQueuedPartyQueueRequests(db, eventId),
      readSavedPartyQueueOrder(db),
    ]);
    const orderIndex = new Map(order.map((id, index) => [id, index]));
    const candidates: QueuedPartyQueueRequest[] = queued;
    candidates.sort((a, b) =>
      (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
      String(a.queued_at || a.requested_at).localeCompare(String(b.queued_at || b.requested_at)),
    );
    const next = candidates[0];
    if (!next) return { ok: false, error: "Er staan geen PartyQueue-aanvragen klaar." };

    const response = await playTrack(next.track_uri);
    if (!response.ok) throw new Error("Spotify kon het volgende nummer niet starten (HTTP " + response.status + ").");

    const updated = await markPartyQueueRequestPlayed(db, eventId, next.id);
    if (!updated) throw new Error("De aanvraag is intussen gewijzigd; probeer opnieuw.");

    await markPartyQueueFallbackInactive(db);
    await saveLastPartyQueueTrack(db, {
      uri: next.track_uri,
      durationMs: next.duration_ms,
      startedAt: now(),
    });
    return { ok: true, track: { name: next.track_name, artist: next.artist_name }, requestId: next.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Volgende PartyQueue-aanvraag starten is mislukt.",
    };
  } finally {
    await releaseQueueDispatchLock(db, owner);
  }
}
