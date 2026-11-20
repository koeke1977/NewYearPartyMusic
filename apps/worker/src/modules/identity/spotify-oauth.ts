const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state",
].join(" ");

export function spotifyOAuthRedirectUri(publicOrigin: string): string {
  return publicOrigin.replace(/\/$/, "") + "/auth/spotify/callback";
}

export function createSpotifyAuthorizationUrl(
  input: { publicOrigin: string; clientId: string },
  state: string,
): { url: string; redirectUri: string } {
  const redirectUri = spotifyOAuthRedirectUri(input.publicOrigin);
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SPOTIFY_SCOPES);
  url.searchParams.set("state", state);
  return { url: url.toString(), redirectUri };
}
