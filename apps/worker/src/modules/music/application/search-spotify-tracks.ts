import type { SpotifyTrack } from "../../../integrations/spotify/types";

type Result = { status: 200 | 400 | 429 | 502 | 503; body: Record<string, unknown> };
type SearchResponse = { tracks?: { items?: SpotifyTrack[] } };

function mapTrack(track: SpotifyTrack) {
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: track.artists.map(artist => artist.name),
    albumImageUrl: track.album.images?.[1]?.url || track.album.images?.[0]?.url || null,
    durationMs: track.duration_ms,
  };
}

export async function searchGuestSpotifyTracks(input: {
  query: string;
  search(query: string, limit: number): Promise<Response>;
}): Promise<Result> {
  const query = input.query.trim();
  if (query.length < 2 || query.length > 100) {
    return { status: 400, body: { error: "Zoek op minstens 2 en maximaal 100 tekens." } };
  }
  try {
    const response = await input.search(query, 8);
    if (response.status === 429) {
      return { status: 429, body: { error: "Spotify krijgt even veel zoekopdrachten. Probeer zo meteen opnieuw." } };
    }
    if (!response.ok) {
      return { status: 502, body: { error: "Spotify zoeken is mislukt (HTTP " + response.status + ")." } };
    }
    const data = await response.json() as SearchResponse;
    return { status: 200, body: { tracks: (data.tracks?.items || []).map(mapTrack), attribution: "Music data provided by Spotify" } };
  } catch (error) {
    return { status: 503, body: { error: error instanceof Error ? error.message : "Spotify is tijdelijk niet beschikbaar." } };
  }
}

export async function searchDjSpotifyTracks(input: {
  queries: unknown;
  search(query: string, limit: number): Promise<Response>;
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
      const response = await input.search(query, 3);
      if (!response.ok) return { query, tracks: [] };
      const data = await response.json() as SearchResponse;
      return {
        query,
        tracks: (data.tracks?.items || []).map(track => ({
          id: track.id, uri: track.uri, name: track.name,
          artists: track.artists.map(artist => artist.name),
          durationMs: track.duration_ms,
          albumImageUrl: track.album.images?.[1]?.url || track.album.images?.[0]?.url || null,
        })),
      };
    }));
    return { status: 200, body: { ok: true, results } };
  } catch (error) {
    return { status: 502, body: { error: error instanceof Error ? error.message : "Spotify zoeken is tijdelijk niet beschikbaar." } };
  }
}
