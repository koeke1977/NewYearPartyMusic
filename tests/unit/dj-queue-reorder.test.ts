import { describe, expect, it, vi } from "vitest";
import { createDjQueueReorderController } from "../../apps/web/modules/dj-queue-reorder.js";

function card(id, top = 0, height = 100) {
  const classes = new Set();
  return {
    dataset: { requestId: id },
    offsetHeight: height,
    getBoundingClientRect: () => ({ top }),
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name),
    },
  };
}

function harness(cards) {
  const handlers = {};
  const container = {
    addEventListener: (name, handler) => { handlers[name] = handler; },
    querySelectorAll: () => cards,
  };
  const save = vi.fn(async () => {});
  const controller = createDjQueueReorderController(container, save);
  return { handlers, save, controller, cards };
}

describe("DJ queue reorder controller", () => {
  it("tracks the active drag and clears it after dragend", () => {
    const a = card("a");
    const { handlers, controller } = harness([a]);
    handlers.dragstart({
      target: { closest: () => a },
      dataTransfer: { setData: vi.fn() },
    });

    expect(controller.isDragging()).toBe(true);
    handlers.dragend();
    expect(controller.isDragging()).toBe(false);
  });

  it("calculates and saves the reordered queue when dropped before a target", async () => {
    const a = card("a", 0);
    const b = card("b", 100);
    const { handlers, save } = harness([a, b]);
    handlers.dragstart({
      target: { closest: () => b },
      dataTransfer: { setData: vi.fn(), effectAllowed: "" },
    });

    let prevented = false;
    await handlers.drop({
      target: { closest: () => b },
      clientY: 20,
      preventDefault: () => { prevented = true; },
    });

    expect(prevented).toBe(true);
    expect(save).toHaveBeenCalledWith(["b", "a"]);
  });

  it("calculates and saves the reordered queue when dropped after a target", async () => {
    const a = card("a", 0);
    const b = card("b", 100);
    const c = card("c", 200);
    const { handlers, save } = harness([a, b, c]);
    handlers.dragstart({
      target: { closest: () => c },
      dataTransfer: { setData: vi.fn(), effectAllowed: "" },
    });

    await handlers.drop({
      target: { closest: () => a },
      clientY: 80,
      preventDefault: vi.fn(),
    });

    expect(save).toHaveBeenCalledWith(["a", "c", "b"]);
  });

  it("does not save when dropping on the dragged card itself", async () => {
    const a = card("a");
    const { handlers, save } = harness([a]);
    handlers.dragstart({
      target: { closest: () => a },
      dataTransfer: { setData: vi.fn(), effectAllowed: "" },
    });
    await handlers.drop({
      target: { closest: () => a },
      clientY: 50,
      preventDefault: vi.fn(),
    });

    expect(save).not.toHaveBeenCalled();
  });
});
