import type { GuestRequestRepository } from "./guest-request-ports";
import type { CatalogTrack } from "../../music/domain/catalog-track";

type Result = { status: number; body: Record<string, unknown> };

export type GuestRequestErrorCode =
  | "not_configured" | "invalid_guest_input" | "invalid_event_code" | "event_inactive"
  | "guest_not_found" | "requests_paused" | "request_rate_limit"
  | "duplicate_track" | "track_unavailable" | "request_unavailable";

export type GuestRequestOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: GuestRequestErrorCode; message: string } };

function positiveIntegerSetting(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export type GuestRequestTrackGateway = { getTrack(trackId: string): Promise<CatalogTrack | null> };

export async function joinPartyGuest(input: {
  repository: GuestRequestRepository;
  eventId: string;
  nickname: string;
  eventCode: string;
  expectedCodeHash: string;
  sessionSecret: string;
  hashCode(value: string): Promise<string>;
  createToken(payload: { sub: string; eventId: string; nickname: string; exp: number }, secret: string): Promise<string>;
  createId(): string;
  nowSeconds(): number;
}): Promise<GuestRequestOutcome<{ guest: { id: string; nickname: string }; sessionToken: string; expiresAt: number }>> {
  if (!input.expectedCodeHash || !input.sessionSecret) {
    return { ok: false, error: { code: "not_configured", message: "PartyQueue is not configured yet. Please contact the DJ." } };
  }
  if (input.nickname.length < 2 || input.nickname.length > 24 || !input.eventCode || input.eventCode.length > 32) {
    return { ok: false, error: { code: "invalid_guest_input", message: "Vul een nickname (2–24 tekens) en de feestcode in." } };
  }
  if ((await input.hashCode(input.eventCode)) !== input.expectedCodeHash.trim().toLowerCase()) {
    return { ok: false, error: { code: "invalid_event_code", message: "Die feestcode klopt niet. Vraag de DJ om de juiste code." } };
  }
  const event = await input.repository.findActiveEvent(input.eventId);
  if (!event) return { ok: false, error: { code: "event_inactive", message: "Dit feest is momenteel niet actief." } };
  const guestId = input.createId();
  const expiresAt = input.nowSeconds() + 60 * 60 * 12;
  const token = await input.createToken({ sub: guestId, eventId: event.id, nickname: input.nickname, exp: expiresAt }, input.sessionSecret);
  await input.repository.insertGuest({ id: guestId, eventId: event.id, nickname: input.nickname });
  return {
    ok: true,
    value: { guest: { id: guestId, nickname: input.nickname }, sessionToken: token, expiresAt },
  };
}

export async function submitGuestTrackRequest(input: {
  repository: GuestRequestRepository;
  eventId: string;
  guestId: string;
  trackId: string;
  createId(): string;
  trackGateway: GuestRequestTrackGateway;
}): Promise<GuestRequestOutcome<{ request: { id: string; name: string; artists: string[]; status: string } }>> {
  const guest = await input.repository.findEventGuest(input.guestId, input.eventId);
  if (!guest) return { ok: false, error: { code: "guest_not_found", message: "Gast niet gevonden. Meld je opnieuw aan." } };

  const config = await input.repository.readGuestRequestSettings();
  if (config.requests_paused === "true") {
    return { ok: false, error: { code: "requests_paused", message: "De DJ heeft aanvragen tijdelijk gepauzeerd." } };
  }

  const rateLimit = positiveIntegerSetting(config.max_requests_per_hour, 20);
  const recentCount = await input.repository.countRecentGuestRequests(input.guestId);
  if (recentCount >= rateLimit) {
    return { ok: false, error: { code: "request_rate_limit", message: "Je maximum van " + rateLimit + " aanvragen per uur is bereikt." } };
  }

  const duplicate = await input.repository.findActiveTrackRequest(input.eventId, input.trackId);
  if (duplicate) return { ok: false, error: { code: "duplicate_track", message: "Dit nummer staat al in de wachtrij." } };

  try {
    const track = await input.trackGateway.getTrack(input.trackId);
    if (!track) return { ok: false, error: { code: "track_unavailable", message: "We konden dit nummer niet meer ophalen bij Spotify." } };
    const requestId = input.createId();
    const status = config.auto_approve === "true" ? (config.auto_queue === "true" ? "queued" : "approved") : "pending";
    const artists = track.artists;
    const inserted = await input.repository.insertGuestTrackRequest({
      id: requestId, event_id: input.eventId, guest_id: input.guestId, spotify_track_id: track.id,
      track_uri: track.uri, track_name: track.name, artist_name: artists.join(", "),
      album_image_url: track.albumImageUrl,
      duration_ms: track.durationMs, status,
    }, { maxRequestsPerHour: rateLimit });
    if (!inserted) {
      const latestRecentCount = await input.repository.countRecentGuestRequests(input.guestId);
      if (latestRecentCount >= rateLimit) {
        return { ok: false, error: { code: "request_rate_limit", message: "Je maximum van " + rateLimit + " aanvragen per uur is bereikt." } };
      }
      return { ok: false, error: { code: "duplicate_track", message: "Dit nummer staat al in de wachtrij." } };
    }
    return { ok: true, value: { request: { id: requestId, name: track.name, artists, status } } };
  } catch (error) {
    return { ok: false, error: { code: "request_unavailable", message: error instanceof Error ? error.message : "Aanvraag kon niet worden opgeslagen." } };
  }
}

export async function moderatePartyRequest(input: {
  repository: GuestRequestRepository;
  eventId: string;
  requestId: string;
  action: string;
}): Promise<Result> {
  const current = await input.repository.findEventRequestStatus(input.eventId, input.requestId);
  if (!current) return { status: 404, body: { error: "Aanvraag niet gevonden." } };

  const transitions: Record<string, { from: string[]; to: string }> = {
    approve: { from: ["pending"], to: "approved" },
    reject: { from: ["pending", "approved", "queued"], to: "rejected" },
    played: { from: ["approved", "queued"], to: "played" },
    queue: { from: ["approved"], to: "queued" },
  };
  const transition = transitions[input.action];
  const autoQueue = input.action === "approve" ? await input.repository.readAutoQueueSetting() : false;
  if (!transition || !transition.from.includes(current.status)) {
    return { status: 409, body: { error: "Deze actie kan niet op deze aanvraag worden uitgevoerd." } };
  }
  const nextStatus = autoQueue ? "queued" : transition.to;
  const timestamp = input.action === "played" ? "played_at"
    : input.action === "queue" || autoQueue ? "queued_at"
    : input.action === "approve" ? "approved_at" : null;
  const changed = await input.repository.transitionRequestStatus(
    input.eventId, input.requestId, transition.from, nextStatus, timestamp,
  );
  if (!changed) return { status: 409, body: { error: "Deze aanvraag is intussen gewijzigd. Vernieuw de lijst en probeer opnieuw." } };
  return { status: 200, body: { ok: true, status: nextStatus } };
}

export async function queueApprovedPartyRequest(input: {
  repository: GuestRequestRepository;
  eventId: string;
  requestId: string;
}): Promise<Result> {
  const row = await input.repository.findEventRequestStatus(input.eventId, input.requestId);
  if (!row || row.status !== "approved") {
    return { status: 409, body: { error: "Alleen goedgekeurde nummers kunnen naar de PartyQueue-wachtrij." } };
  }
  const changed = await input.repository.moveApprovedRequestToQueue(input.eventId, input.requestId);
  if (!changed) return { status: 409, body: { error: "Alleen goedgekeurde nummers kunnen naar de PartyQueue-wachtrij." } };
  return { status: 200, body: { ok: true, status: "queued" } };
}

export async function addDjTrackToPartyQueue(input: {
  repository: GuestRequestRepository;
  eventId: string;
  trackId: string;
  createId(): string;
  trackGateway: GuestRequestTrackGateway;
}): Promise<Result> {
  try {
    const duplicate = await input.repository.findActiveTrackRequest(input.eventId, input.trackId);
    if (duplicate) return { status: 200, body: { ok: true, alreadyQueued: true, status: duplicate.status } };
    const track = await input.trackGateway.getTrack(input.trackId);
    if (!track) return { status: 502, body: { error: "Spotify kon dit nummer niet meer ophalen." } };
    const guestId = await input.repository.createDjQueueGuest(input.eventId);
    const requestId = input.createId();
    const artists = track.artists;
    const inserted = await input.repository.insertTrackRequest({
      id: requestId, event_id: input.eventId, guest_id: guestId, spotify_track_id: track.id,
      track_uri: track.uri, track_name: track.name, artist_name: artists.join(", "),
      album_image_url: track.albumImageUrl, duration_ms: track.durationMs, status: "queued",
    });
    if (!inserted) {
      const existing = await input.repository.findActiveTrackRequest(input.eventId, track.id);
      return {
        status: 200,
        body: { ok: true, alreadyQueued: true, status: existing?.status || "queued" },
      };
    }
    await input.repository.appendRequestToQueueOrder(requestId);
    return {
      status: 201,
      body: { ok: true, request: { id: requestId, name: track.name, artist: artists.join(", "), status: "queued" } },
    };
  } catch (error) {
    return { status: 502, body: { error: error instanceof Error ? error.message : "Track toevoegen aan de wachtrij is mislukt." } };
  }
}
