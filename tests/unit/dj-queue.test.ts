import { describe, expect, it } from "vitest";
import { orderedQueued } from "../../apps/web/modules/dj-queue.js";

const requests = [
  { id: "a", status: "queued", queued_at: "2026-01-01T00:00:00Z" },
  { id: "b", status: "pending", requested_at: "2026-01-01T00:01:00Z" },
  { id: "c", status: "queued", queued_at: "2026-01-01T00:02:00Z" },
  { id: "d", status: "queued", requested_at: "2026-01-01T00:03:00Z" },
];

describe("DJ queue ordering", () => {
  it("uses the saved order first and preserves chronological order for unlisted requests", () => {
    expect(orderedQueued(requests, ["c", "a"]).map((item) => item.id)).toEqual(["c", "a", "d"]);
  });

  it("ignores non-queued requests and tolerates invalid saved-order data", () => {
    expect(orderedQueued(requests, null).map((item) => item.id)).toEqual(["a", "c", "d"]);
  });
});
