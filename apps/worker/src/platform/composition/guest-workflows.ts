import type { Env } from "../env";
import { sha256 } from "../security/crypto";
import { createSessionToken } from "../../modules/identity/session-token";
import { joinPartyGuest, submitGuestTrackRequest, addDjTrackToPartyQueue } from "../../modules/requests/application/guest-request-lifecycle";
import { searchGuestSpotifyTracks, searchDjSpotifyTracks } from "../../modules/music/application/search-spotify-tracks";
import { getSpotifyTrack, searchSpotifyTracks } from "../../integrations/spotify/catalog-api";

export function joinGuestFromEnvironment(env: Env, nickname: string, eventCode: string) {
  return joinPartyGuest({
    db: env.DB, eventId: env.EVENT_ID, nickname, eventCode,
    expectedCodeHash: env.EVENT_ACCESS_CODE_HASH, sessionSecret: env.SESSION_SECRET,
    hashCode: sha256, createToken: createSessionToken,
    createId: () => crypto.randomUUID(), nowSeconds: () => Math.floor(Date.now() / 1000),
  });
}

export function submitGuestRequestFromEnvironment(env: Env, guestId: string, trackId: string) {
  return submitGuestTrackRequest({
    db: env.DB, eventId: env.EVENT_ID, guestId, trackId,
    createId: () => crypto.randomUUID(),
    getSpotifyTrack: (id) => getSpotifyTrack(env, id),
  });
}

export function addDjTrackFromEnvironment(env: Env, trackId: string) {
  return addDjTrackToPartyQueue({
    db: env.DB, eventId: env.EVENT_ID, trackId,
    createId: () => crypto.randomUUID(),
    getSpotifyTrack: (id) => getSpotifyTrack(env, id),
  });
}

export function searchGuestTracksFromEnvironment(env: Env, query: string) {
  return searchGuestSpotifyTracks({
    query, search: (value, limit) => searchSpotifyTracks(env, value, limit),
  });
}

export function searchDjTracksFromEnvironment(env: Env, queries: unknown) {
  return searchDjSpotifyTracks({
    queries, search: (value, limit) => searchSpotifyTracks(env, value, limit),
  });
}
