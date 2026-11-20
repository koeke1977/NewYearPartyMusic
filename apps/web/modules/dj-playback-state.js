export function normalizeSpotifyVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

export function getSpotifyPlaybackControls(connected, playing) {
  const isConnected = Boolean(connected);
  const isPlaying = Boolean(playing);
  return {
    playSelected: isConnected && isPlaying,
    pauseSelected: isConnected && !isPlaying,
    playEnabled: isConnected,
    pauseEnabled: isConnected,
    boothPlaying: isConnected && isPlaying,
    boothStatus: !isConnected ? "OFFLINE" : isPlaying ? "ON AIR" : "PAUSED",
  };
}

export function getSpotifyPlaybackSummary(data) {
  if (!data || typeof data !== "object") {
    return { connection: "NOT CONNECTED", nowPlaying: "No track is currently playing." };
  }
  const track = data.track;
  const nowPlaying = data.autoAdvanceError
    ? "AUTO NEXT ERROR · " + data.autoAdvanceError
    : data.fallbackError
      ? "FALLBACK ERROR · " + data.fallbackError
      : track
        ? (data.playing ? "▶ NOW PLAYING · " : "Ⅱ PAUSED · ") + track.name + " — " + track.artists.join(", ")
        : "No track is currently playing.";
  return {
    connection: data.connected ? "CONNECTED" : "NOT CONNECTED",
    nowPlaying,
    device: data.device
      ? "ACTIVE DEVICE · " + data.device.name + " (" + data.device.type + ")"
      : "Spotify is connected. Open Spotify on a device to make it active.",
    hasActiveDevice: Boolean(data.device),
    volume: typeof data.device?.volume === "number" ? normalizeSpotifyVolume(data.device.volume) : null,
  };
}
