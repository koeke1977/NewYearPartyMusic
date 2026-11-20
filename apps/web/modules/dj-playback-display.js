export function formatTrackTime(milliseconds) {
  const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

export function getTrackProgress(progressMs, durationMs) {
  const duration = Math.max(0, Number(durationMs) || 0);
  const progress = Math.max(0, Math.min(duration, Number(progressMs) || 0));
  return {
    duration,
    progress,
    percent: duration ? Math.round((progress / duration) * 100) : 0,
  };
}

export function getTrackProgressStatus(durationMs, playing) {
  return !Number(durationMs) ? "WAITING FOR TRACK" : playing ? "TRACK PLAYING" : "TRACK PAUSED";
}
