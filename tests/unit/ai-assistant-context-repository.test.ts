import { describe, expect, it, vi } from "vitest";
import { loadAssistantContextSnapshot } from "../../apps/worker/src/modules/ai/infrastructure/assistant-context-repository";

function createDatabase(profile: string | null) {
  const calls: string[] = [];
  const prepare = vi.fn((sql: string) => {
    calls.push(sql);
    const statement = {
      bind: (..._args: unknown[]) => statement,
      async first() {
        if (sql.includes("dj_ai_profile_")) return profile ? { value: profile } : null;
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
      queued: [], recentlyPlayed: [],
      audience: { respondents: 0, genres: [], subgenres: [], decades: [], moods: [], averageEnergy: null },
      crowdFeedback: { eligible: false, respondents: 0, windowMinutes: 30, atmosphere: null, averageEnergy: null, trend: "insufficient" },
    });
    expect(db.calls.some(sql => /requests.*status='queued'/.test(sql))).toBe(true);
    expect(db.calls.some(sql => /status='played'.*LIMIT 8/.test(sql))).toBe(true);
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
    expect(snapshot.partyQueue.crowdFeedback.trend).toBe("insufficient");
  });
});
