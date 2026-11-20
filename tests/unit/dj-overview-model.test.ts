import { describe, expect, it } from "vitest";
import { createDjOverviewModel } from "../../apps/web/modules/dj-overview-model.js";

const request = (id, status, duration_ms = 0) => ({
  id, status, duration_ms, track_name: "Track " + id,
});

describe("DJ overview model", () => {
  it("projects request counts and music durations by lifecycle status", () => {
    const model = createDjOverviewModel({
      requests: [
        request("a", "pending", 180000),
        request("b", "queued", 240000),
        request("c", "played", 200000),
        request("d", "rejected", 90000),
      ],
    });

    expect(model.counts).toEqual({ total: 4, queued: 1, played: 1 });
    expect(model.durations).toEqual({ requested: 620000, remaining: 420000 });
  });

  it("uses the saved queue order for upcoming tracks and the next track", () => {
    const model = createDjOverviewModel({
      requests: [request("a", "queued"), request("b", "queued"), request("c", "pending")],
      queueOrder: ["b", "a"],
    });

    expect(model.queued.map(item => item.id)).toEqual(["b", "a"]);
    expect(model.nextQueued.id).toBe("b");
    expect(model.queuePositions.get("b")).toBe(0);
    expect(model.queuePositions.get("a")).toBe(1);
  });

  it("only exposes live requests for the actionable DJ request list", () => {
    const model = createDjOverviewModel({
      requests: [
        request("a", "pending"),
        request("b", "approved"),
        request("c", "queued"),
        request("d", "played"),
        request("e", "rejected"),
      ],
    });

    expect(model.liveRequests.map(item => item.id)).toEqual(["a", "b", "c"]);
    expect([...model.queuePositions.keys()]).toEqual(["c"]);
  });

  it("handles missing overview fields and invalid duration values", () => {
    const model = createDjOverviewModel({
      requests: [request("a", "queued", "not-a-number")],
    });

    expect(model.settings).toBeNull();
    expect(model.counts.total).toBe(1);
    expect(model.durations).toEqual({ requested: 0, remaining: 0 });
    expect(model.nextQueued.id).toBe("a");
  });
});
