import { describe, expect, it } from "vitest";
import {
  findMusicGenreId, listMusicGenres, MUSIC_DECADES, MUSIC_DANCEABILITY_SCALE,
  MUSIC_ENERGY_SCALE, MUSIC_GENRES, MUSIC_MOODS,
} from "../../apps/worker/src/modules/music/domain/genre-taxonomy";

describe("PartyQueue music taxonomy", () => {
  it("defines unique stable IDs for genres and subgenres", () => {
    const entries = listMusicGenres();
    const ids = entries.map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))).toBe(true);
  });

  it("contains broad party-relevant genre families and expandable subgenres", () => {
    expect(MUSIC_GENRES.length).toBeGreaterThanOrEqual(8);
    expect(MUSIC_GENRES.every(genre => genre.subgenres.length > 0)).toBe(true);
    expect(findMusicGenreId("Disco")).toBe("disco");
    expect(findMusicGenreId("Italo Disco")).toBe("italo-disco");
    expect(findMusicGenreId("Après-Ski")).toBe("apres-ski");
    expect(findMusicGenreId("Vlaamse Klassiekers")).toBe("flemish-classics");
  });

  it("supports shared music dimensions without coupling them to guest identity", () => {
    expect(MUSIC_DECADES.map(item => item.id)).toContain("90s");
    expect(MUSIC_MOODS).toContain("feel-good");
    expect(MUSIC_ENERGY_SCALE).toEqual({ min: 1, max: 10 });
    expect(MUSIC_DANCEABILITY_SCALE).toEqual({ min: 1, max: 10 });
  });

  it("returns null for unknown or empty genre labels", () => {
    expect(findMusicGenreId("")).toBeNull();
    expect(findMusicGenreId("not a real genre")).toBeNull();
  });
});
