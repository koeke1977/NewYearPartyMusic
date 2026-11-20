import type { Env } from "../env";
import { sha256 } from "../security/crypto";
import { createSessionToken } from "./session-token";
import { joinPartyGuest, submitGuestTrackRequest, addDjTrackToPartyQueue, type GuestRequestTrack } from "../../modules/requests/application/guest-request-lifecycle";
import { searchGuestSpotifyTracks, searchDjSpotifyTracks } from "../../modules/music/application/search-spotify-tracks";
import { getSpotifyCatalogTrack, searchSpotifyCatalog } from "../../integrations/spotify/catalog-api";
import { createGuestRequestRepository } from "../../modules/requests/infrastructure/guest-request-d1-repository";

export function joinGuestFromEnvironment(env: Env, nickname: string, eventCode: string) {
  return joinPartyGuest({
    repository: createGuestRequestRepository(env.DB), eventId: env.EVENT_ID, nickname, eventCode,
    expectedCodeHash: env.EVENT_ACCESS_CODE_HASH, sessionSecret: env.SESSION_SECRET,
    hashCode: sha256, createToken: createSessionToken,
    createId: () => crypto.randomUUID(), nowSeconds: () => Math.floor(Date.now() / 1000),
  });
}

export function submitGuestRequestFromEnvironment(env: Env, guestId: string, trackId: string) {
  return submitGuestTrackRequest({
    repository: createGuestRequestRepository(env.DB), eventId: env.EVENT_ID, guestId, trackId,
    createId: () => crypto.randomUUID(),
    trackGateway: { getTrack: (id) => getSpotifyCatalogTrack(env, id) },
  });
}

export function addDjTrackFromEnvironment(env: Env, trackId: string) {
  return addDjTrackToPartyQueue({
    repository: createGuestRequestRepository(env.DB), eventId: env.EVENT_ID, trackId,
    createId: () => crypto.randomUUID(),
    trackGateway: { getTrack: (id) => getGuestRequestTrack(env, id) },
  });
}

export function searchGuestTracksFromEnvironment(env: Env, query: string) {
  return searchGuestSpotifyTracks({
    query, gateway: { search: (value, limit) => searchSpotifyCatalog(env, value, limit) },
  });
}

export function searchDjTracksFromEnvironment(env: Env, queries: unknown) {
  return searchDjSpotifyTracks({
    queries, gateway: { search: (value, limit) => searchSpotifyCatalog(env, value, limit) },
  });
}
