// Owns drag-and-drop interaction for the DJ's manually ordered queue.
export function createDjQueueReorderController(container, onSave) {
  let draggedRequestId = null;

  container.addEventListener("dragstart", event => {
    const card = event.target.closest(".dj-request-queued");
    if (!card) return;
    draggedRequestId = card.dataset.requestId;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedRequestId);
  });

  container.addEventListener("dragover", event => {
    if (!draggedRequestId) return;
    const target = event.target.closest(".dj-request-queued");
    if (!target || target.dataset.requestId === draggedRequestId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const before = event.clientY < target.getBoundingClientRect().top + target.offsetHeight / 2;
    container.querySelectorAll(".dj-request-queued").forEach(card => {
      card.classList.toggle("drop-before", card === target && before);
      card.classList.toggle("drop-after", card === target && !before);
    });
  });

  container.addEventListener("drop", async event => {
    if (!draggedRequestId) return;
    const target = event.target.closest(".dj-request-queued");
    if (!target || target.dataset.requestId === draggedRequestId) return;
    event.preventDefault();

    const order = [...container.querySelectorAll(".dj-request-queued")].map(card => card.dataset.requestId);
    const from = order.indexOf(draggedRequestId);
    const to = order.indexOf(target.dataset.requestId);
    if (from >= 0 && to >= 0) {
      const [moved] = order.splice(from, 1);
      const before = event.clientY < target.getBoundingClientRect().top + target.offsetHeight / 2;
      const insertAt = before ? to : to + 1;
      order.splice(insertAt > from ? insertAt - 1 : insertAt, 0, moved);
    }

    draggedRequestId = null;
    await onSave(order);
  });

  container.addEventListener("dragend", () => {
    draggedRequestId = null;
    container.querySelectorAll(".dj-request-queued").forEach(card => {
      card.classList.remove("is-dragging", "drop-before", "drop-after");
    });
  });

  return {
    isDragging() {
      return draggedRequestId !== null;
    },
  };
}
