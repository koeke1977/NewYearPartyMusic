import { describe, expect, it, vi } from "vitest";
import { searchGuestTracks, submitGuestTrackRequest, submitGuestCrowdFeedback } from "../../apps/web/modules/guest-music-api.js";

describe("guest music API", () => {
  it("encodes search terms and sends the existing guest bearer token", async () => {
    const payload = { tracks: [{ id: "track-1" }] };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => payload }));
    const signal = { aborted: false };

    const result = await searchGuestTracks("AC/DC & Bowie", "guest-token", signal, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("/api/spotify/search?q=AC%2FDC%20%26%20Bowie", {
      headers: { Authorization: "Bearer guest-token" },
      signal,
    });
    expect(result).toEqual(payload);
  });

  it("returns the server error for a rejected search", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Search limit reached" }),
    }));

    await expect(searchGuestTracks("artist", "token", undefined, fetchImpl))
      .rejects.toThrow("Search limit reached");
  });

  it("posts a selected track using the current request contract", async () => {
    const payload = { request: { id: "request-1", status: "approved" } };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => payload }));

    const result = await submitGuestTrackRequest("spotify:track:123", "guest-token", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer guest-token" },
      body: JSON.stringify({ trackId: "spotify:track:123" }),
    });
    expect(result).toEqual(payload);
  });

  it("returns the server error for a rejected request", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Requests are paused" }),
    }));

    await expect(submitGuestTrackRequest("track-1", "token", fetchImpl))
      .rejects.toThrow("Requests are paused");
  });
});


describe("guest crowd feedback API", () => {
  it("posts the current guest signal with the event session token", async () => {
    const payload = { ok: true };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => payload }));
    const feedback = { atmosphere: "good", energy: 4 };
    const result = await submitGuestCrowdFeedback(feedback, "guest-token", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/api/guests/crowd-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer guest-token" },
      body: JSON.stringify({ feedback }),
    });
    expect(result).toEqual(payload);
  });

  it("returns the server rate-limit message", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({ error: "Je kan feedback aanpassen." }) }));
    await expect(submitGuestCrowdFeedback({ atmosphere: "good", energy: 3 }, "token", fetchImpl)).rejects.toThrow("Je kan feedback aanpassen.");
  });
});
