import { describe, expect, it, vi } from "vitest";
import { saveGuestMusicPreferences, validateGuestMusicPreferences } from "../../apps/worker/src/modules/music/application/guest-music-preferences";

describe("guest music preferences", () => {
  it("requires at least one known genre or subgenre", () => {
    expect(validateGuestMusicPreferences({ genreIds: [], decadeIds: [], moodIds: [] })).toBeNull();
    expect(validateGuestMusicPreferences({ genreIds: ["not-a-genre"] })).toBeNull();
    expect(validateGuestMusicPreferences({ genreIds: ["disco"] })).toMatchObject({ genreIds: ["disco"] });
  });

  it("validates optional decades, moods and bounded energy", () => {
    expect(validateGuestMusicPreferences({
      genreIds: ["house"], decadeIds: ["90s", "00s"], moodIds: ["feel-good", "singalong"], energy: 8,
    })).toEqual({ genreIds: ["house"], decadeIds: ["90s", "00s"], moodIds: ["feel-good", "singalong"], energy: 8 });
    expect(validateGuestMusicPreferences({ genreIds: ["house"], energy: 11 })).toBeNull();
    expect(validateGuestMusicPreferences({ genreIds: ["house"], decadeIds: ["1890s"] })).toBeNull();
    expect(validateGuestMusicPreferences({ genreIds: ["house"], moodIds: ["angry"] })).toBeNull();
  });

  it("deduplicates selections and rejects oversized payloads", () => {
    expect(validateGuestMusicPreferences({ genreIds: ["disco", "disco"] })?.genreIds).toEqual(["disco"]);
    expect(validateGuestMusicPreferences({ genreIds: Array(31).fill("disco") })).toBeNull();
  });

  it("persists only validated event-scoped preferences", async () => {
    const save = vi.fn(async () => {});
    const result = await saveGuestMusicPreferences({
      repository: { save }, guestId: "guest-1", eventId: "NYE2026",
      preferences: { genreIds: ["disco", "house"], decadeIds: ["90s"], moodIds: ["energetic"], energy: 7 },
    });
    expect(result).toEqual({ ok: true });
    expect(save).toHaveBeenCalledWith({
      guestId: "guest-1", eventId: "NYE2026",
      preferences: { genreIds: ["disco", "house"], decadeIds: ["90s"], moodIds: ["energetic"], energy: 7 },
    });
  });
});
