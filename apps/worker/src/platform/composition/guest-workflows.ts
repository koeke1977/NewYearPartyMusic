import type { Env } from "../env";
import { sha256 } from "../security/crypto";
import { createSessionToken } from "../../modules/identity/session-token";
import { joinPartyGuest, submitGuestTrackRequest, addDjTrackToPartyQueue, type GuestRequestTrack } from "../../modules/requests/application/guest-request-lifecycle";
import { searchGuestSpotifyTracks, searchDjSpotifyTracks } from "../../modules/music/application/search-spotify-tracks";
import { getSpotifyTrack, searchSpotifyTracks } from "../../integrations/spotify/catalog-api";

async function getGuestRequestTrack(env: Env, trackId: string): Promise<GuestRequestTrack | null> {
  const response = await getSpotifyTrack(env, trackId);
  if (!response.ok) return null;
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("Spotify gaf een ongeldig trackantwoord terug.");
  const track = payload as Record<string, unknown>;
  const artists = Array.isArray(track.artists) ? track.artists : null;
  if (typeof track.id !== "string" || typeof track.uri !== "string" || typeof track.name !== "string" ||
      typeof track.duration_ms !== "number" || !artists ||
      !artists.every(artist => !!artist && typeof artist === "object" && typeof (artist as {name?:unknown}).name === "string")) {
    throw new Error("Spotify gaf een onvolledig trackantwoord terug.");
  }
  const album = track.album && typeof track.album === "object" ? track.album as Record<string, unknown> : undefined;
  const images = Array.isArray(album?.images)
    ? album.images.filter((image): image is {url:string} => !!image && typeof image === "object" && typeof (image as {url?:unknown}).url === "string")
    : undefined;
  return {
    id: track.id, uri: track.uri, name: track.name,
    artists: artists as Array<{name:string}>,
    album: images ? { images } : undefined,
    duration_ms: track.duration_ms,
  };
}

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
    trackGateway: { getTrack: (id) => getGuestRequestTrack(env, id) },
  });
}

export function addDjTrackFromEnvironment(env: Env, trackId: string) {
  return addDjTrackToPartyQueue({
    db: env.DB, eventId: env.EVENT_ID, trackId,
    createId: () => crypto.randomUUID(),
    trackGateway: { getTrack: (id) => getGuestRequestTrack(env, id) },
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
