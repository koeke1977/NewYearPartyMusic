import { describe, expect, it } from "vitest";
import { matchDjQueueProposal } from "../../apps/web/modules/dj-ai-queue-parser.js";

const queued = [
  { id: "one", track_name: "Like a Prayer", artist_name: "Madonna" },
  { id: "two", track_name: "Music Sounds Better With You", artist_name: "Stardust" },
  { id: "three", track_name: "Freed from Desire", artist_name: "Gala" },
];

describe("DJ AI queue proposal matching", () => {
  it("matches a complete numbered proposal to the existing queue, independent of order", () => {
    expect(matchDjQueueProposal(
      "1. Freed from Desire — Gala\n2. Like a Prayer — Madonna\n3. Music Sounds Better With You — Stardust",
      queued,
    )).toEqual({ ids: ["three", "one", "two"], unmatchedLines: [] });
  });

  it("accepts a unique title when the proposed artist is wrong", () => {
    expect(matchDjQueueProposal("1. Like a Prayer — Incorrect Artist", queued)).toEqual({
      ids: ["one"],
      unmatchedLines: [],
    });
  });

  it("rejects ambiguous, missing and duplicate matches instead of inventing queue IDs", () => {
    const ambiguous = [
      { id: "a", track_name: "The Promise", artist_name: "Artist A" },
      { id: "b", track_name: "The Promise", artist_name: "Artist B" },
    ];
    expect(matchDjQueueProposal(
      "1. The Promise — Unknown\n2. Missing Song — Nobody\n3. Like a Prayer — Madonna\n4. Like a Prayer — Madonna",
      [...ambiguous, queued[0]],
    )).toEqual({
      ids: ["one"],
      unmatchedLines: ["The Promise — Unknown", "Missing Song — Nobody", "Like a Prayer — Madonna"],
    });
  });
});
