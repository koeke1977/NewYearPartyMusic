import { describe, expect, it, vi } from "vitest";
import { createDjApi } from "../../apps/web/modules/dj-api.js";

describe("DJ API client", () => {
  it("adds the current DJ bearer token and JSON content type for a body", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const api = createDjApi(() => "dj-token", fetcher);
    await expect(api("/api/dj/settings/auto_queue", {
      method: "POST",
      body: JSON.stringify({ enabled: true }),
    })).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith("/api/dj/settings/auto_queue", {
      method: "POST",
      body: JSON.stringify({ enabled: true }),
      headers: {
        Authorization: "Bearer dj-token",
        "Content-Type": "application/json",
      },
    });
  });

  it("preserves caller headers and reports API errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "DJ-sessie verlopen." }), { status: 401 }));
    const api = createDjApi(() => "token", fetcher);
    await expect(api("/api/dj/overview", { headers: { "X-Trace": "test" } })).rejects.toThrow("DJ-sessie verlopen.");
    expect(fetcher.mock.calls[0][1].headers).toEqual({
      "X-Trace": "test",
      Authorization: "Bearer token",
    });
  });

  it("uses a stable message when the response is not valid JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("not-json", { status: 502 }));
    const api = createDjApi(() => "token", fetcher);
    await expect(api("/api/dj/overview")).rejects.toThrow("Ongeldig antwoord van server.");
  });
});
