import type { SpotifyTrack } from "../../../integrations/spotify/types";
import {
  countRecentGuestRequests,
  findActiveTrackRequest,
  findActiveEvent,
  findEventGuest,
  insertGuest,
  insertTrackRequest,
  readGuestRequestSettings,
  type GuestRequestDatabase,
} from "../infrastructure/guest-request-repository";

type Result = { status: number; body: Record<string, unknown> };

export async function joinPartyGuest(input: {
  db: GuestRequestDatabase;
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
  const event = await findActiveEvent(input.db, input.eventId);
  if (!event) return { status: 403, body: { error: "Dit feest is momenteel niet actief." } };
  const guestId = input.createId();
  await insertGuest(input.db, { id: guestId, eventId: event.id, nickname: input.nickname });
  const expiresAt = input.nowSeconds() + 60 * 60 * 12;
  const token = await input.createToken({ sub: guestId, eventId: event.id, nickname: input.nickname, exp: expiresAt }, input.sessionSecret);
  return { status: 201, body: { ok: true, guest: { id: guestId, nickname: input.nickname }, sessionToken: token, expiresAt } };
}

export async function submitGuestTrackRequest(input: {
  db: GuestRequestDatabase;
  eventId: string;
  guestId: string;
  trackId: string;
  createId(): string;
  getSpotifyTrack(trackId: string): Promise<Response>;
}): Promise<Result> {
  const guest = await findEventGuest(input.db, input.guestId, input.eventId);
  if (!guest) return { status: 401, body: { error: "Gast niet gevonden. Meld je opnieuw aan." } };

  const config = await readGuestRequestSettings(input.db);
  if (config.requests_paused === "true") {
    return { status: 403, body: { error: "De DJ heeft aanvragen tijdelijk gepauzeerd." } };
  }

  const rateLimit = Number(config.max_requests_per_hour || 20);
  const recentCount = await countRecentGuestRequests(input.db, input.guestId);
  if (recentCount >= rateLimit) {
    return { status: 429, body: { error: "Je maximum van " + rateLimit + " aanvragen per uur is bereikt." } };
  }

  const duplicate = await findActiveTrackRequest(input.db, input.eventId, input.trackId);
  if (duplicate) return { status: 409, body: { error: "Dit nummer staat al in de wachtrij." } };

  try {
    const response = await input.getSpotifyTrack(input.trackId);
    if (!response.ok) return { status: 400, body: { error: "We konden dit nummer niet meer ophalen bij Spotify." } };
    const track = await response.json() as SpotifyTrack;
    const requestId = input.createId();
    const status = config.auto_approve === "true" ? (config.auto_queue === "true" ? "queued" : "approved") : "pending";
    const artists = track.artists.map(artist => artist.name);
    await insertTrackRequest(input.db, {
      id: requestId, event_id: input.eventId, guest_id: input.guestId, spotify_track_id: track.id,
      track_uri: track.uri, track_name: track.name, artist_name: artists.join(", "),
      album_image_url: track.album.images?.[1]?.url || track.album.images?.[0]?.url || null,
      duration_ms: track.duration_ms, status,
    });
    return { status: 201, body: { ok: true, request: { id: requestId, name: track.name, artists, status } } };
  } catch (error) {
    return { status: 503, body: { error: error instanceof Error ? error.message : "Aanvraag kon niet worden opgeslagen." } };
  }
}
