import type { GuestRequestRepository } from "./guest-request-ports";

type Result = { status: number; body: Record<string, unknown> };

export type GuestRequestTrack = { id:string; uri:string; name:string; artists:Array<{name:string}>; album?:{images?:Array<{url:string}>}; duration_ms:number };
export type GuestRequestTrackGateway = { getTrack(trackId:string):Promise<GuestRequestTrack|null> };

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
}): Promise<Result> {
  if (!input.expectedCodeHash || !input.sessionSecret) {
    return { status: 503, body: { error: "PartyQueue is not configured yet. Please contact the DJ." } };
  }
  if (input.nickname.length < 2 || input.nickname.length > 24 || !input.eventCode || input.eventCode.length > 32) {
    return { status: 400, body: { error: "Vul een nickname (2–24 tekens) en de feestcode in." } };
  }
  if ((await input.hashCode(input.eventCode)) !== input.expectedCodeHash.trim().toLowerCase()) {
    return { status: 401, body: { error: "Die feestcode klopt niet. Vraag de DJ om de juiste code." } };
  }
  const event = await input.repository.findActiveEvent(input.eventId);
  if (!event) return { status: 403, body: { error: "Dit feest is momenteel niet actief." } };
  const guestId = input.createId();
  await input.repository.insertGuest({ id: guestId, eventId: event.id, nickname: input.nickname });
  const expiresAt = input.nowSeconds() + 60 * 60 * 12;
  const token = await input.createToken({ sub: guestId, eventId: event.id, nickname: input.nickname, exp: expiresAt }, input.sessionSecret);
  return {
    status: 201,
    body: { ok: true, guest: { id: guestId, nickname: input.nickname }, sessionToken: token, expiresAt },
  };
}

export async function submitGuestTrackRequest(input: {
  repository: GuestRequestRepository;
  eventId: string;
  guestId: string;
  trackId: string;
  createId(): string;
  trackGateway: GuestRequestTrackGateway;
}): Promise<Result> {
  const guest = await input.repository.findEventGuest(input.guestId, input.eventId);
  if (!guest) return { status: 401, body: { error: "Gast niet gevonden. Meld je opnieuw aan." } };

  const config = await input.repository.readGuestRequestSettings();
  if (config.requests_paused === "true") {
    return { status: 403, body: { error: "De DJ heeft aanvragen tijdelijk gepauzeerd." } };
  }

  const rateLimit = Number(config.max_requests_per_hour || 20);
  const recentCount = await input.repository.countRecentGuestRequests(input.guestId);
  if (recentCount >= rateLimit) {
    return { status: 429, body: { error: "Je maximum van " + rateLimit + " aanvragen per uur is bereikt." } };
  }

  const duplicate = await input.repository.findActiveTrackRequest(input.eventId, input.trackId);
  if (duplicate) return { status: 409, body: { error: "Dit nummer staat al in de wachtrij." } };

  try {
    const track = await input.trackGateway.getTrack(input.trackId);
    if (!track) return { status: 400, body: { error: "We konden dit nummer niet meer ophalen bij Spotify." } };
    const requestId = input.createId();
    const status = config.auto_approve === "true" ? (config.auto_queue === "true" ? "queued" : "approved") : "pending";
    const artists = track.artists.map(artist => artist.name);
    await input.repository.insertTrackRequest({
      id: requestId, event_id: input.eventId, guest_id: input.guestId, spotify_track_id: track.id,
      track_uri: track.uri, track_name: track.name, artist_name: artists.join(", "),
      album_image_url: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null,
      duration_ms: track.duration_ms, status,
    });
    return { status: 201, body: { ok: true, request: { id: requestId, name: track.name, artists, status } } };
  } catch (error) {
    return { status: 503, body: { error: error instanceof Error ? error.message : "Aanvraag kon niet worden opgeslagen." } };
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
  await input.repository.updateRequestStatus(input.eventId, input.requestId, nextStatus, timestamp);
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
    const artists = track.artists.map(artist => artist.name);
    await input.repository.insertTrackRequest({
      id: requestId, event_id: input.eventId, guest_id: guestId, spotify_track_id: track.id,
      track_uri: track.uri, track_name: track.name, artist_name: artists.join(", "),
      album_image_url: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null,
      duration_ms: track.duration_ms, status: "queued",
    });
    await input.repository.appendRequestToQueueOrder(requestId);
    return {
      status: 201,
      body: { ok: true, request: { id: requestId, name: track.name, artist: artists.join(", "), status: "queued" } },
    };
  } catch (error) {
    return { status: 502, body: { error: error instanceof Error ? error.message : "Track toevoegen aan de wachtrij is mislukt." } };
  }
}
