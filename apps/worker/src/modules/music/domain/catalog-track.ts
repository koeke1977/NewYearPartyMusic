/** Provider-independent Spotify catalogue track used by music and request workflows. */
export type CatalogTrack = {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  albumImageUrl: string | null;
  durationMs: number;
};
