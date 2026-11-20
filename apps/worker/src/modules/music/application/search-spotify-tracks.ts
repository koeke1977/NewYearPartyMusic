import type { CatalogTrack } from "../domain/catalog-track";
export type { CatalogTrack } from "../domain/catalog-track";

export type CatalogSearchResult =
  | { kind: "available"; tracks: CatalogTrack[] }
  | { kind: "rate-limited" }
  | { kind: "unavailable"; status: number };

/** Application-owned port result: no Spotify wire DTOs or Fetch Response objects cross this boundary. */
export interface SpotifyCatalogSearchGateway {
  search(query: string, limit: number): Promise<CatalogSearchResult>;
}

type Result = { status: 200 | 400 | 429 | 502 | 503; body: Record<string, unknown> };

function guestTrackView(track: CatalogTrack) {
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: track.artists,
    albumImageUrl: track.albumImageUrl,
    durationMs: track.durationMs,
  };
}

export async function searchGuestSpotifyTracks(input: {
  query: string;
  gateway: SpotifyCatalogSearchGateway;
}): Promise<Result> {
  const query = input.query.trim();
  if (query.length < 2 || query.length > 100) {
    return { status: 400, body: { error: "Zoek op minstens 2 en maximaal 100 tekens." } };
  }
  try {
    const result = await input.gateway.search(query, 8);
    if (result.kind === "rate-limited") {
      return { status: 429, body: { error: "Spotify krijgt even veel zoekopdrachten. Probeer zo meteen opnieuw." } };
    }
    if (result.kind === "unavailable") {
      return { status: 502, body: { error: "Spotify zoeken is mislukt (HTTP " + result.status + ")." } };
    }
    return {
      status: 200,
      body: { tracks: result.tracks.map(guestTrackView), attribution: "Music data provided by Spotify" },
    };
  } catch (error) {
    return { status: 503, body: { error: error instanceof Error ? error.message : "Spotify is tijdelijk niet beschikbaar." } };
  }
}

export async function searchDjSpotifyTracks(input: {
  queries: unknown;
  gateway: SpotifyCatalogSearchGateway;
}): Promise<Result> {
  if (!Array.isArray(input.queries) || input.queries.length > 20 || !input.queries.every(query => typeof query === "string")) {
    return { status: 400, body: { error: "Geef maximaal 20 trackzoekopdrachten door." } };
  }
  const queries = (input.queries as string[])
    .map(query => query.replace(/\s+/g, " ").trim().slice(0, 140))
    .filter(query => query.length > 2);
  if (!queries.length) {
    return { status: 400, body: { error: "Ik kon geen bruikbare titels en artiesten uit de lijst halen." } };
  }
  try {
    const results = await Promise.all(queries.map(async query => {
      const result = await input.gateway.search(query, 3);
      return {
        query,
        tracks: result.kind === "available" ? result.tracks.map(guestTrackView) : [],
      };
    }));
    return { status: 200, body: { ok: true, results } };
  } catch (error) {
    return { status: 502, body: { error: error instanceof Error ? error.message : "Spotify zoeken is tijdelijk niet beschikbaar." } };
  }
}
