export type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { images?: { url: string; width?: number; height?: number }[] };
};
