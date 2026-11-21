import { describe, expect, it, vi } from "vitest";
import type { CatalogTrack } from "../../apps/worker/src/modules/music/domain/catalog-track";
import {
  detectDJActionIntent, executeDJAssistantActions, parseDJAssistantActionEnvelope,
} from "../../apps/worker/src/modules/ai/application/execute-dj-assistant-actions";
import type { DJAssistantActionPorts } from "../../apps/worker/src/modules/ai/application/execute-dj-assistant-actions";

const track: CatalogTrack = {
  id: "1234567890123456789012",
  uri: "spotify:track:1234567890123456789012",
  name: "Music Sounds Better With You",
  artists: ["Stardust"],
  albumImageUrl: null,
  durationMs: 360000,
};

function ports(overrides: Partial<DJAssistantActionPorts> = {}) {
  return {
    searchTracks: vi.fn(async () => [track]),
    addTrack: vi.fn(async () => ({ status: 201, body: { ok: true, request: { id: "queue-1" } } })),
    readQueueIds: vi.fn(async () => ["queue-1", "queue-2"]),
    removeQueuedTrack: vi.fn(async () => ({ status: 200, body: { ok: true, status: "rejected" } })),
    reorderQueue: vi.fn(async (order: string[]) => ({ ok: true, value: { order } })),
    ...overrides,
  };
}

describe("DJ assistant action planning", () => {
  it("recognizes explicit add, remove and reorder commands but not ordinary advice", () => {
    expect(detectDJActionIntent("Voeg 20 schuurschijven toe aan PartyQueue")).toEqual({ add: true, remove: false, reorder: false });
    expect(detectDJActionIntent("Voeg die lijst toe")).toEqual({ add: true, remove: false, reorder: false });
    expect(detectDJActionIntent("Zet die lijst in PartyQueue")).toEqual({ add: true, remove: false, reorder: false });
    expect(detectDJActionIntent("Haal track X uit de wachtrij")).toEqual({ add: false, remove: true, reorder: false });
    expect(detectDJActionIntent("Ik wil de Frank Sinatra tracks uit PartyQueue verwijderen")).toEqual({ add: false, remove: true, reorder: false });
    expect(detectDJActionIntent("Haal Frank Sinatra eruit")).toEqual({ add: false, remove: true, reorder: false });
    expect(detectDJActionIntent("Herschik de PartyQueue")).toEqual({ add: false, remove: false, reorder: true });
    expect(detectDJActionIntent("Geef me een verrassend disco-setplan")).toEqual({ add: false, remove: false, reorder: false });
    expect(detectDJActionIntent("Vul de lijst met suggesties aan")).toEqual({ add: false, remove: false, reorder: false });
    expect(detectDJActionIntent("Geef me een lijst met suggesties")).toEqual({ add: false, remove: false, reorder: false });
  });

  it("parses only bounded, known action envelopes", () => {
    expect(parseDJAssistantActionEnvelope(JSON.stringify({
      answer: "Ik voeg de gekozen tracks toe.",
      actions: [{ type: "add_tracks", tracks: [{ title: track.name, artist: "Stardust" }] }],
    }))?.actions).toHaveLength(1);
    expect(parseDJAssistantActionEnvelope(JSON.stringify({
      answer: "Do something unsafe", actions: [{ type: "delete_database" }],
    }))).toBeNull();
    expect(parseDJAssistantActionEnvelope("not JSON")).toBeNull();
  });

  it("searches Spotify and adds only an exact title-and-artist match", async () => {
    const dependencies = ports();
    const result = await executeDJAssistantActions({
      prompt: "Voeg Music Sounds Better With You van Stardust toe aan PartyQueue",
      actions: [{ type: "add_tracks", tracks: [{ title: track.name, artist: "Stardust" }] }],
      ports: dependencies,
    });
    expect(dependencies.searchTracks).toHaveBeenCalledWith(track.name + " Stardust");
    expect(dependencies.addTrack).toHaveBeenCalledWith(track.id);
    expect(result[0]).toMatchObject({ type: "add_tracks", succeeded: 1, alreadyPresent: 0, failed: 0 });
  });

  it("does not add a near match or act on an advice-only prompt", async () => {
    const dependencies = ports({
      searchTracks: vi.fn(async () => [{ ...track, name: "Music Sounds Better (Radio Edit)" }]),
    });
    const result = await executeDJAssistantActions({
      prompt: "Geef me een verrassend disco-setplan",
      actions: [{ type: "add_tracks", tracks: [{ title: track.name, artist: "Stardust" }] }],
      ports: dependencies,
    });
    expect(result).toEqual([]);
    expect(dependencies.searchTracks).not.toHaveBeenCalled();
    expect(dependencies.addTrack).not.toHaveBeenCalled();
  });

  it("honours the Autopilot hard stop after Spotify search and before adding", async () => {
    const dependencies = ports({
      canContinue: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    });
    const result = await executeDJAssistantActions({
      prompt: "Voeg Music Sounds Better With You van Stardust toe aan PartyQueue",
      actions: [{ type: "add_tracks", tracks: [{ title: track.name, artist: "Stardust" }] }],
      ports: dependencies,
    });
    expect(dependencies.searchTracks).toHaveBeenCalledOnce();
    expect(dependencies.addTrack).not.toHaveBeenCalled();
    expect(result[0].details.join(" ")).toContain("Autopilot is gestopt");
  });

  it("skips a track rejected by the recent-repeat guard", async () => {
    const dependencies = ports({ isTrackAllowed: () => false });
    const result = await executeDJAssistantActions({
      prompt: "Voeg Music Sounds Better With You van Stardust toe aan PartyQueue",
      actions: [{ type: "add_tracks", tracks: [{ title: track.name, artist: "Stardust" }] }],
      ports: dependencies,
    });
    expect(dependencies.searchTracks).toHaveBeenCalledOnce();
    expect(dependencies.addTrack).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({ succeeded: 0, failed: 1 });
    expect(result[0].details[0]).toContain("recente herhaling");
  });

  it("removes only live queue IDs and verifies that each removed track disappeared", async () => {
    const readQueueIds = vi.fn()
      .mockResolvedValueOnce(["queue-1", "queue-2"])
      .mockResolvedValueOnce(["queue-2"])
      .mockResolvedValueOnce(["queue-2"]);
    const dependencies = ports({ readQueueIds });
    const result = await executeDJAssistantActions({
      prompt: "Verwijder deze tracks uit de wachtrij",
      actions: [{ type: "remove_tracks", requestIds: ["queue-1", "not-queued"] }],
      ports: dependencies,
    });
    expect(dependencies.removeQueuedTrack).toHaveBeenCalledTimes(1);
    expect(dependencies.removeQueuedTrack).toHaveBeenCalledWith("queue-1");
    expect(readQueueIds).toHaveBeenCalledTimes(3);
    expect(result[0]).toMatchObject({ type: "remove_tracks", succeeded: 1, failed: 1 });
  });

  it("does not report success when the Worker says ok but the track remains queued", async () => {
    const dependencies = ports();
    const result = await executeDJAssistantActions({
      prompt: "Haal track X uit de wachtrij",
      actions: [{ type: "remove_tracks", requestIds: ["queue-1"] }],
      ports: dependencies,
    });
    expect(result[0]).toMatchObject({ type: "remove_tracks", succeeded: 0, failed: 1 });
    expect(result[0].details[0]).toContain("staat nog in PartyQueue");
  });

  it("reorders only when the model returns the complete current queue", async () => {
    const dependencies = ports();
    const result = await executeDJAssistantActions({
      prompt: "Herschik de PartyQueue",
      actions: [{ type: "reorder_queue", requestIds: ["queue-2", "queue-1"] }],
      ports: dependencies,
    });
    expect(dependencies.reorderQueue).toHaveBeenCalledWith(["queue-2", "queue-1"]);
    expect(result[0]).toMatchObject({ type: "reorder_queue", succeeded: 1, failed: 0 });

    const invalid = ports();
    await executeDJAssistantActions({
      prompt: "Herschik de PartyQueue",
      actions: [{ type: "reorder_queue", requestIds: ["queue-1"] }],
      ports: invalid,
    });
    expect(invalid.reorderQueue).not.toHaveBeenCalled();
  });
});
