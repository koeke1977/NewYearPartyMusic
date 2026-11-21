import { describe, expect, it } from "vitest";
import { getAudienceIntelligence } from "../../apps/worker/src/modules/music/application/get-audience-intelligence";

describe("event-scoped audience intelligence", () => {
  it("aggregates unique guest choices and calculates capped genre weights", async () => {
    const result = await getAudienceIntelligence({
      eventId: "NYE2026",
      repository: {
        async readEventPreferences(eventId) {
          expect(eventId).toBe("NYE2026");
          return [
            { genre_ids_json: '["disco","house"]', decade_ids_json: '["90s"]', mood_ids_json: '["energetic","feel-good"]', energy: 8 },
            { genre_ids_json: '["disco"]', decade_ids_json: '["90s"]', mood_ids_json: '["feel-good"]', energy: 6 },
            { genre_ids_json: '["classic-rock"]', decade_ids_json: '["80s"]', mood_ids_json: '["nostalgic"]', energy: null },
            { genre_ids_json: '["house","deep-house"]', decade_ids_json: '["00s"]', mood_ids_json: '["energetic"]', energy: 10 },
          ];
        },
      },
    });

    expect(result.respondents).toBe(4);
    expect(result.genres.map(item => [item.id, item.guests])).toEqual([
      ["disco-funk-soul", 2], ["electronic-dance", 2], ["rock-alternative", 1],
    ]);
    expect(result.subgenres.find(item => item.id === "house")?.guests).toBe(2);
    expect(result.subgenres.find(item => item.id === "deep-house")?.guests).toBe(1);
    expect(result.decades[0]).toMatchObject({ id: "90s", guests: 2, share: 0.5 });
    expect(result.moods.find(item => item.id === "energetic")?.guests).toBe(2);
    expect(result.averageEnergy).toBe(8);
    expect(result.genres.every(item => item.balancedWeight <= 0.35)).toBe(true);
    expect(result.genres.reduce((sum, item) => sum + item.balancedWeight, 0)).toBeCloseTo(1);
  });

  it("does not double-count a guest selecting both a parent genre and its subgenre", async () => {
    const result = await getAudienceIntelligence({
      eventId: "test-event",
      repository: {
        async readEventPreferences() {
          return [
            { genre_ids_json: '["electronic-dance","house"]', decade_ids_json: "[]", mood_ids_json: "[]", energy: null },
          ];
        },
      },
    });
    expect(result.respondents).toBe(1);
    expect(result.genres).toHaveLength(1);
    expect(result.genres[0].guests).toBe(1);
    expect(result.subgenres[0].guests).toBe(1);
    expect(result.averageEnergy).toBeNull();
  });

  it("returns an empty, event-scoped profile when nobody has responded", async () => {
    const result = await getAudienceIntelligence({
      eventId: "empty-event",
      repository: { async readEventPreferences() { return []; } },
    });
    expect(result).toMatchObject({
      eventId: "empty-event", respondents: 0, genres: [], subgenres: [],
      decades: [], moods: [], averageEnergy: null,
    });
  });

  it("ignores malformed preference JSON rather than failing the DJ overview", async () => {
    const result = await getAudienceIntelligence({
      eventId: "test-event",
      repository: {
        async readEventPreferences() {
          return [{ genre_ids_json: "{bad", decade_ids_json: "null", mood_ids_json: "[]", energy: 7 }];
        },
      },
    });
    expect(result.respondents).toBe(1);
    expect(result.genres).toEqual([]);
    expect(result.averageEnergy).toBe(7);
  });
});
