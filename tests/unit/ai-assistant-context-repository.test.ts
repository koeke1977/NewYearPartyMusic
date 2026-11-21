import { describe, expect, it, vi } from "vitest";
import { loadAssistantContextSnapshot } from "../../apps/worker/src/modules/ai/infrastructure/assistant-context-repository";

function createDatabase(profile: string | null) {
  const calls: string[] = [];
  const prepare = vi.fn((sql: string) => {
    calls.push(sql);
    const values: unknown[] = [];
    const statement = {
      bind: (...args: unknown[]) => { values.push(...args); return statement; },
      async first() {
        if (values[0] && String(values[0]).startsWith("dj_ai_profile_")) return profile ? { value: profile } : null;
        return null;
      },
      async all() { return { results: [] }; },
    };
    return statement;
  });
  return { prepare, calls };
}

describe("AI assistant context repository", () => {
  it("loads bounded event-scoped queue, played history and aggregate audience signals", async () => {
    const db = createDatabase('["disco","90s"]');
    const snapshot = await loadAssistantContextSnapshot(db as never, "event-1");
    expect(snapshot.djPreferences).toBe('["disco","90s"]');
    expect(snapshot.partyQueue).toEqual({
      activity: { totalRequests: 0, uniqueTracksRequested: 0, pending: 0, approved: 0, queued: 0, played: 0, rejected: 0, failed: 0, topArtists: [] },
      queued: [], recentlyPlayed: [],
      audience: { respondents: 0, genres: [], subgenres: [], decades: [], moods: [], averageEnergy: null },
      crowdFeedback: { eligible: false, respondents: 0, windowMinutes: 30, atmosphere: null, averageEnergy: null, trend: "insufficient" },
    });
    expect(db.calls.some(sql => /requests.*status='queued'/.test(sql))).toBe(true);
    expect(db.calls.some(sql => /status='played'.*LIMIT 8/.test(sql))).toBe(true);
    expect(db.calls.some(sql => /COUNT\(DISTINCT spotify_track_id\)/.test(sql))).toBe(true);
    expect(db.calls.some(sql => /GROUP BY artist_name/.test(sql))).toBe(true);
    expect(db.calls.some(sql => /guest_music_preferences/.test(sql))).toBe(true);
    expect(db.calls.some(sql => /guest_crowd_feedback/.test(sql))).toBe(true);
    expect(db.calls.every(sql => !/nickname|guest_id|spotify_access_token/i.test(sql))).toBe(true);
  });

  it("returns null preferences and empty event context when D1 has no DJ profile", async () => {
    const db = createDatabase(null);
    const snapshot = await loadAssistantContextSnapshot(db as never, "empty-event");
    expect(snapshot.djPreferences).toBeNull();
    expect(snapshot.partyQueue.queued).toEqual([]);
    expect(snapshot.partyQueue.recentlyPlayed).toEqual([]);
    expect(snapshot.partyQueue.activity.totalRequests).toBe(0);
    expect(snapshot.partyQueue.crowdFeedback.trend).toBe("insufficient");
  });
});
