// Encapsulates authenticated DJ mutations and their UI reconciliation lifecycle.
export function createDjCommandService({ api, refresh, onMessage }) {
  let queueReorderBusy = false;

  async function saveQueueOrder(order) {
    if (queueReorderBusy) return;
    queueReorderBusy = true;
    onMessage("Saving new play order…");
    try {
      await api("/api/dj/queue/reorder", { method: "POST", body: JSON.stringify({ order }) });
      onMessage("Play order updated.");
      await refresh();
    } catch (error) {
      onMessage(error.message);
      await refresh();
    } finally {
      queueReorderBusy = false;
    }
  }

  async function runRequestAction(id, action, button) {
    button.disabled = true;
    onMessage("Sending command to the booth…");
    try {
      if (action === "queue") {
        await api("/api/dj/spotify/queue/" + encodeURIComponent(id), { method: "POST" });
      } else {
        await api("/api/dj/requests/" + encodeURIComponent(id) + "/" + action, { method: "POST" });
      }
      onMessage("Deck updated.");
      await refresh();
    } catch (error) {
      onMessage(error.message);
      button.disabled = false;
    }
  }

  async function updateSetting(key, enabled) {
    onMessage("Updating party controls…");
    try {
      await api("/api/dj/settings/" + key, { method: "POST", body: JSON.stringify({ enabled }) });
      onMessage("Party controls updated.");
      await refresh();
    } catch (error) {
      onMessage(error.message);
    }
  }

  return { saveQueueOrder, runRequestAction, updateSetting };
}
