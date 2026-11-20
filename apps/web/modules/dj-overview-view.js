import { orderedQueued } from "./dj-queue.js";
import { createDjOverviewModel } from "./dj-overview-model.js";
import { element as el } from "./dom.js";

// Owns DJ dashboard, request-card and UP NEXT DOM rendering.
export function createDjOverviewView({
  requestList,
  queueReorder,
  commands,
  spotifyConsole,
  getQueuePreview = () => null,
  documentRef = document,
}) {
  let currentSettings = { requestsPaused: false, autoApprove: true, autoQueue: false };
  let latestDJOverview = null;

  function stat(label, value, icon) {
    const box = el("div", "dj-stat");
    box.append(el("span", "dj-stat-icon", icon));
    const copy = el("div", "dj-stat-copy");
    copy.append(el("span", "dj-muted", label), el("strong", "", String(value)));
    box.append(copy);
    return box;
  }

  function formatMusicTime(milliseconds) {
    const minutes = Math.max(0, Math.round((Number(milliseconds) || 0) / 60000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? hours + "u " + String(rest).padStart(2, "0") + "m" : minutes + "m";
  }

  function addCover(parent, url, className) {
    if (!url) return;
    const image = el("img", className);
    image.src = url;
    image.alt = "Album artwork";
    image.loading = "lazy";
    parent.append(image);
  }

  function trackLine(request, index) {
    const row = el("div", "queue-track");
    row.append(el("span", "queue-position", String(index + 1).padStart(2, "0")));
    addCover(row, request.album_image_url, "");
    const info = el("div", "queue-track-info");
    info.append(el("strong", "", request.track_name), el("span", "", request.artist_name));
    row.append(info, row.appendChild(el("span", "queue-state", "QUEUED")));
    return row;
  }

  function renderDeck(requests, queueOrder) {
    const queued = orderedQueued(requests, queueOrder);
    const list = documentRef.querySelector("#up-next");
    if (!list) return;
    list.replaceChildren();
    const upcoming = queued.slice(0, 10);
    const total = documentRef.querySelector("#queue-total");
    if (total) total.textContent = queued.length + " TRACKS";
    if (!upcoming.length) {
      list.append(el("p", "dj-empty", "The queue is waiting for its first track."));
      return;
    }
    upcoming.forEach((request, index) => list.append(trackLine(request, index)));
  }

  function render(data) {
    latestDJOverview = data;
    currentSettings = data.settings || currentSettings;
    const autoQueueState = documentRef.querySelector("#auto-queue-state");
    if (autoQueueState) autoQueueState.textContent = currentSettings.autoQueue ? "ON" : "OFF";
    const requestButton = documentRef.querySelector("#pause-toggle");
    const approvalButton = documentRef.querySelector("#approval-toggle");
    const queueButton = documentRef.querySelector("#auto-queue-toggle");
    [[requestButton, !currentSettings.requestsPaused], [approvalButton, currentSettings.autoApprove], [queueButton, currentSettings.autoQueue]].forEach(([button, enabled]) => {
      if (!button) return;
      button.classList.toggle("is-active", enabled);
      button.classList.toggle("is-inactive", !enabled);
      button.setAttribute("aria-pressed", String(enabled));
    });
    documentRef.querySelector("#pause-state").textContent = currentSettings.requestsPaused ? "PAUSED" : "ACCEPTING";
    documentRef.querySelector("#approval-state").textContent = currentSettings.autoApprove ? "AUTO" : "DJ";

    const overview = createDjOverviewModel(data);
    const { requests, queueOrder, queued, liveRequests, queuePositions, nextQueued } = overview;
    const stats = documentRef.querySelector("#dj-stats");
    stats.replaceChildren(
      stat("AANVRAGEN", overview.counts.total, "♫"),
      stat("IN WACHTRIJ", overview.counts.queued, "☷"),
      stat("GESPEELD", overview.counts.played, "✓"),
      stat("MUZIEK GEKOZEN", formatMusicTime(overview.durations.requested), "♧"),
      stat("NOG TE SPELEN", formatMusicTime(overview.durations.remaining), "⌛")
    );
    renderDeck(requests, queueOrder);
    spotifyConsole.setDeck("right", nextQueued
      ? { name: nextQueued.track_name, artist: nextQueued.artist_name, album_image_url: nextQueued.album_image_url }
      : getQueuePreview());

    const nextButton = documentRef.querySelector("#partyqueue-next");
    if (nextButton) {
      const empty = queued.length === 0;
      nextButton.disabled = empty;
      nextButton.classList.toggle("is-fallback", empty);
      nextButton.classList.toggle("is-empty", false);
      nextButton.textContent = empty ? "SPOTIFY" : "NEXT ↗";
      nextButton.title = empty ? "Spotify fallback mode · PartyQueue queue is empty" : "Play next PartyQueue request";
      nextButton.setAttribute("aria-label", empty ? "Spotify fallback mode; PartyQueue queue is empty" : "Play next PartyQueue request");
    }
    documentRef.querySelector("#request-count").textContent = requests.length + " REQUESTS";
    documentRef.querySelector("#last-updated").textContent = "SYNCED " + new Date().toLocaleTimeString();

    // Do not replace cards while a drag operation is in progress.
    if (queueReorder.isDragging()) return;
    requestList.replaceChildren();
    if (!liveRequests.length) {
      requestList.append(el("p", "dj-empty", "No incoming requests. The dancefloor is waiting…"));
      return;
    }
    for (const request of liveRequests) {
      const isQueued = request.status === "queued";
      const card = el("article", "dj-request" + (isQueued ? " dj-request-queued" : ""));
      card.dataset.requestId = request.id;
      if (isQueued) {
        card.draggable = true;
        card.dataset.queueIndex = String(queuePositions.get(request.id));
        const grip = el("span", "queue-drag-handle", "⠿");
        grip.title = "Sleep om de afspeelvolgorde te wijzigen";
        grip.setAttribute("aria-hidden", "true");
        card.append(grip);
      }
      addCover(card, request.album_image_url, "dj-cover");
      const info = el("div", "dj-track");
      if (isQueued) card.append(el("span", "queue-position", String(queuePositions.get(request.id) + 1).padStart(2, "0")));
      info.append(
        el("strong", "dj-track-name", request.track_name),
        el("span", "dj-muted", request.artist_name),
        el("span", "dj-requester", "REQUESTED BY " + (request.nickname || "GUEST").toUpperCase())
      );
      info.append(el("span", "dj-status status-" + request.status, request.status.replace("_", " ").toUpperCase()));
      card.append(info);
      const actions = el("div", "dj-actions");
      const addAction = (action, label, className) => {
        const button = el("button", className, label);
        button.type = "button";
        button.addEventListener("click", () => commands.runRequestAction(request.id, action, button));
        actions.append(button);
      };
      if (request.status === "pending") addAction("approve", "✓ APPROVE", "dj-action dj-positive");
      if (request.status === "approved") addAction("queue", "＋ CUE TO QUEUE", "dj-action dj-positive");
      if (["pending", "approved", "queued"].includes(request.status)) addAction("reject", "✕ REJECT", "dj-action dj-negative");
      if (["approved", "queued"].includes(request.status)) addAction("played", "MARK PLAYED", "dj-action");
      if (actions.childElementCount) card.append(actions);
      requestList.append(card);
    }
  }

  return {
    getLatestOverview: () => latestDJOverview,
    getSettings: () => currentSettings,
    render,
  };
}
