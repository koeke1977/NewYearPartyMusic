import { createLatestTaskQueue } from "./dj-latest-task-queue.js";
import { formatTrackTime, getTrackProgress, getTrackProgressStatus } from "./dj-playback-display.js";
import { normalizeSpotifyVolume, getSpotifyPlaybackControls, getSpotifyPlaybackSummary } from "./dj-playback-state.js";
import { element as el } from "./dom.js";

// Owns the Spotify-facing DJ console UI, status refresh and playback control bindings.
export function createDjSpotifyConsole({ api, getPlayback, onMessage = () => {}, documentRef = document, windowRef = window }) {
  function setDeck(side, track) {
    const title = documentRef.querySelector("#booth-track-title-" + side);
    const artist = documentRef.querySelector("#booth-track-artist-" + side);
    const image = documentRef.querySelector("#booth-track-image-" + side);
    const placeholder = documentRef.querySelector("#booth-track-placeholder-" + side);
    if (title) title.textContent = track?.name || (side === "left" ? "Waiting for Spotify" : "SPOTIFY MIX");
    if (artist) artist.textContent = track?.artists?.join(", ") || track?.artist || (side === "left" ? "Spotify deck" : "Party Hits · SHUFFLE");
    if (!image) return;
    if (track?.image || track?.album_image_url) {
      image.src = track.image || track.album_image_url;
      image.hidden = false;
      if (placeholder) placeholder.hidden = true;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
      if (placeholder) placeholder.hidden = false;
    }
  }

  function updateMasterVolumeDisplay(value) {
    const volume = normalizeSpotifyVolume(value);
    const slider = documentRef.querySelector("#master-volume");
    const label = documentRef.querySelector("#master-volume-value");
    const leds = documentRef.querySelector("#master-volume-leds");
    if (slider) slider.value = String(volume);
    if (label) label.textContent = volume + "%";
    if (leds) {
      const active = Math.round(volume / 5);
      leds.replaceChildren();
      for (let i = 0; i < 20; i++) {
        const led = documentRef.createElement("i");
        if (i < active) led.className = i >= 16 ? "hot" : i >= 12 ? "high" : "active";
        leds.append(led);
      }
      leds.setAttribute("aria-valuenow", String(volume));
    }
  }

  function updateTrackProgress(progressMs, durationMs, playing) {
    const { duration, progress, percent } = getTrackProgress(progressMs, durationMs);
    const leds = documentRef.querySelector("#track-progress-leds");
    const value = documentRef.querySelector("#track-progress-value");
    const elapsed = documentRef.querySelector("#track-progress-elapsed");
    const total = documentRef.querySelector("#track-progress-duration");
    const status = documentRef.querySelector("#track-progress-status");
    if (value) value.textContent = duration ? percent + "%" : "—%";
    if (elapsed) elapsed.textContent = formatTrackTime(progress);
    if (total) total.textContent = formatTrackTime(duration);
    if (status) status.textContent = getTrackProgressStatus(duration, playing);
    if (leds) {
      const active = Math.round(percent / 5);
      leds.replaceChildren();
      for (let i = 0; i < 20; i++) {
        const led = documentRef.createElement("i");
        if (i < active) led.className = i >= 16 ? "hot" : i >= 12 ? "high" : "active";
        leds.append(led);
      }
      leds.setAttribute("aria-valuenow", String(percent));
    }
  }

  function syncPlaybackButtons(connected, playing) {
    const state = getSpotifyPlaybackControls(connected, playing);
    const play = documentRef.querySelector('[data-spotify-command="play"]');
    const pause = documentRef.querySelector('[data-spotify-command="pause"]');
    [[play, state.playSelected], [pause, state.pauseSelected]].forEach(([button, active]) => {
      if (!button) return;
      button.classList.toggle("is-selected", active);
      button.classList.toggle("is-idle", !active);
      button.setAttribute("aria-pressed", String(active));
    });
    const booth = documentRef.querySelector("#partyqueue-booth");
    if (booth) {
      booth.classList.toggle("is-playing", state.boothPlaying);
      const status = documentRef.querySelector("#booth-play-state");
      if (status) status.textContent = state.boothStatus;
    }
  }

  const volumeWrites = createLatestTaskQueue(async (value, { isCurrent }) => {
    const status = documentRef.querySelector("#master-volume-status");
    try {
      await api("/api/dj/spotify/volume", { method: "PUT", body: JSON.stringify({ volume: value }) });
      if (!isCurrent()) return;
      status.textContent = "SPOTIFY MASTER OUTPUT";
      updateMasterVolumeDisplay(value);
    } catch (error) {
      if (!isCurrent()) return;
      status.textContent = error.message;
      await refreshStatus();
    }
  });

  async function refreshStatus() {
    const playback = getPlayback();
    const requestId = playback.beginStatus();
    if (requestId === null) return;
    const state = documentRef.querySelector("#spotify-connection-state");
    const device = documentRef.querySelector("#spotify-device");
    const now = documentRef.querySelector("#spotify-now-playing");
    try {
      const data = await api("/api/dj/spotify/status");
      if (!playback.isStatusCurrent(requestId)) return;
      const summary = getSpotifyPlaybackSummary(data);
      state.textContent = summary.connection;
      const booth = documentRef.querySelector("#partyqueue-booth");
      if (booth) {
        booth.classList.toggle("is-playing", !!data.playing);
        const boothState = documentRef.querySelector("#booth-play-state");
        if (boothState) boothState.textContent = data.fallbackActive ? "SPOTIFY MIX" : data.playing ? "ON AIR" : "STANDBY";
        setDeck("left", data.track ? { name: data.track.name, artists: data.track.artists, image: data.track.image } : null);
        const nextTrack = data.fallbackActive ? data.nextTrack : null;
        const nextButton = documentRef.querySelector("#partyqueue-next");
        if (nextButton?.disabled) setDeck("right", nextTrack);
        updateTrackProgress(data.progressMs, data.track?.durationMs, data.playing);
      }
      state.classList.toggle("accent", !!data.connected);
      documentRef.querySelector("#spotify-connect")?.classList.toggle("is-connected", !!data.connected);
      syncPlaybackButtons(!!data.connected, !!data.playing);
      if (data.fallbackActive) {
        const boothState = documentRef.querySelector("#booth-play-state");
        if (boothState) boothState.textContent = "SPOTIFY MIX";
      }
      device.textContent = summary.device;
      const volumeStatus = documentRef.querySelector("#master-volume-status");
      if (summary.volume !== null) {
        updateMasterVolumeDisplay(summary.volume);
        volumeStatus.textContent = "SPOTIFY MASTER OUTPUT";
      } else {
        volumeStatus.textContent = "NO ACTIVE SPOTIFY DEVICE";
      }
      now.textContent = summary.nowPlaying;
    } catch (error) {
      if (!playback.isStatusCurrent(requestId)) return;
      state.textContent = "NOT CONNECTED";
      documentRef.querySelector("#spotify-connect")?.classList.remove("is-connected");
      syncPlaybackButtons(false, false);
      const booth = documentRef.querySelector("#partyqueue-booth");
      if (booth) {
        booth.classList.remove("is-playing");
        const boothState = documentRef.querySelector("#booth-play-state");
        if (boothState) boothState.textContent = "OFFLINE";
        setDeck("left", null);
        updateTrackProgress(0, 0, false);
      }
      device.textContent = error.message;
      now.textContent = "Connect your Spotify account to enable live playback.";
    } finally {
      playback.completeStatus(requestId);
    }
  }

  function bindControls() {
    const masterVolume = documentRef.querySelector("#master-volume");
    masterVolume.addEventListener("input", () => updateMasterVolumeDisplay(masterVolume.value));
    masterVolume.addEventListener("change", () => {
      const value = normalizeSpotifyVolume(masterVolume.value);
      documentRef.querySelector("#master-volume-status").textContent = "SETTING SPOTIFY VOLUME…";
      volumeWrites.enqueue(value).catch(() => {});
    });
    documentRef.querySelector("#spotify-connect").addEventListener("click", async () => {
      const button = documentRef.querySelector("#spotify-connect");
      button.disabled = true;
      onMessage("Opening Spotify authorization…");
      try {
        const data = await api("/api/dj/spotify/connect", { method: "POST" });
        windowRef.location.href = data.url;
      } catch (error) {
        onMessage(error.message);
        button.disabled = false;
      }
    });
    documentRef.querySelectorAll("[data-spotify-command]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await getPlayback().runCommand(button.dataset.spotifyCommand);
      } finally {
        button.disabled = false;
      }
    }));
  }

  return {
    bindControls,
    invalidate() { volumeWrites.invalidate(); },
    refreshStatus,
    setDeck,
    syncPlaybackButtons,
    updateMasterVolumeDisplay,
  };
}
