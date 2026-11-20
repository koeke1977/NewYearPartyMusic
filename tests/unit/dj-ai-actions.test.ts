import { describe, expect, it, vi } from "vitest";
import { addSelectedDjTracks } from "../../apps/web/modules/dj-ai-actions.js";

describe("DJ AI actions", () => {
  it("adds selected tracks sequentially and reports duplicates and per-track failures", async () => {
    const order = [];
    const addTrack = vi.fn(async track => {
      order.push(track.id);
      if (track.id === "duplicate") return { alreadyQueued: true };
      if (track.id === "failed") throw new Error("Spotify rejected track");
      return { ok: true };
    });
    const progress = vi.fn();
    const result = await addSelectedDjTracks({
      tracks: [{id:"first"},{id:"duplicate"},{id:"failed"},{id:"last"}],
      addTrack,
      onProgress: progress,
    });
    expect(order).toEqual(["first","duplicate","failed","last"]);
    expect(result.added.map(track=>track.id)).toEqual(["first","last"]);
    expect(result.alreadyQueued.map(track=>track.id)).toEqual(["duplicate"]);
    expect(result.failed).toEqual([{track:{id:"failed"},error:"Spotify rejected track"}]);
    expect(progress).toHaveBeenCalledTimes(4);
  });
});
