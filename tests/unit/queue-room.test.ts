import { describe, expect, it } from "vitest";
import { QueueRoom } from "../../apps/worker/src/durable-objects/queue-room";

describe("QueueRoom", () => {
  const room = new QueueRoom({} as DurableObjectState);

  it("exposes its health endpoint", async () => {
    const response = await room.fetch(new Request("https://queue-room/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "queue-room" });
  });

  it("returns not found for unsupported paths", async () => {
    const response = await room.fetch(new Request("https://queue-room/unknown"));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });
});
