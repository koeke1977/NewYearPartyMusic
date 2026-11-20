import { createLatestTaskQueue } from "./dj-latest-task-queue.js";
import { createDjSpotifyConsoleView } from "./dj-spotify-console-view.js";
import { normalizeSpotifyVolume } from "./dj-playback-state.js";

// Owns the Spotify-facing DJ console UI, status refresh and playback control bindings.
export function createDjSpotifyConsole({ api, getPlayback, onMessage = () => {}, onQueuePreview = () => {}, documentRef = document, windowRef = window }) {
  const view=createDjSpotifyConsoleView({documentRef});
  const setDeck=view.setDeck;
  const updateMasterVolumeDisplay=view.updateMasterVolumeDisplay;
  const updateTrackProgress=view.updateTrackProgress;
  const syncPlaybackButtons=view.syncPlaybackButtons;

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
    try {
      const data = await api("/api/dj/spotify/status");
      if (!playback.isStatusCurrent(requestId)) return;
      view.renderStatus(data,onQueuePreview);
    } catch (error) {
      if (!playback.isStatusCurrent(requestId)) return;
      view.renderOffline(error);
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
    documentRef.querySelector("#spotify-disconnect")?.addEventListener("click", async () => {
      const button = documentRef.querySelector("#spotify-disconnect");
      if (typeof windowRef.confirm === "function" &&
          !windowRef.confirm("Spotify ontkoppelen? De opgeslagen Spotify-tokens worden uit PartyQueue verwijderd.")) return;
      button.disabled = true;
      try {
        await api("/api/dj/spotify/connection", { method: "DELETE" });
        view.renderOffline(new Error("Spotify-account disconnected."));
        onMessage("Spotify-account ontkoppeld. De opgeslagen tokens zijn verwijderd.");
      } catch (error) {
        onMessage(error.message);
      } finally {
        button.disabled = false;
      }
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
