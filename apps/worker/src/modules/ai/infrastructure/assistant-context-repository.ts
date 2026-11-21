import type { AssistantContextSnapshot, PartyQueueContext } from "../application/assistant-ports";
import { getAudienceIntelligence } from "../../music/application/get-audience-intelligence";
import { createAudienceIntelligenceRepository } from "../../music/infrastructure/audience-intelligence-d1-repository";
import { getCrowdFeedback } from "../../music/application/crowd-feedback";
import { createCrowdFeedbackRepository } from "../../music/infrastructure/crowd-feedback-d1-repository";
export type { AssistantContextSnapshot } from "../application/assistant-ports";
export type AssistantContextDatabase = Pick<D1Database, "prepare">;
type QueueRow = { id: string; track_name: string; artist_name: string; duration_ms: number | null; queued_at: string | null; played_at: string | null };
function parseOrder(value: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}
/** Loads DJ preferences plus bounded, event-scoped queue and aggregate audience signals. */
export async function loadAssistantContextSnapshot(db: AssistantContextDatabase, eventId: string): Promise<AssistantContextSnapshot> {
  const [profile, queueRows, playedRows, orderSetting, audience, crowdFeedback, activity, artistRows] = await Promise.all([
    db.prepare("SELECT value FROM settings WHERE key=?").bind("dj_ai_profile_" + eventId).first<{ value: string }>(),
    db.prepare("SELECT id,track_name,artist_name,duration_ms,queued_at,played_at FROM requests WHERE event_id=? AND status='queued'").bind(eventId).all<QueueRow>(),
    db.prepare("SELECT id,track_name,artist_name,duration_ms,queued_at,played_at FROM requests WHERE event_id=? AND status='played' ORDER BY played_at DESC LIMIT 8").bind(eventId).all<QueueRow>(),
    db.prepare("SELECT value FROM settings WHERE key='partyqueue_order'").first<{ value: string }>(),
    getAudienceIntelligence({ repository: createAudienceIntelligenceRepository(db), eventId }),
    getCrowdFeedback({ repository: createCrowdFeedbackRepository(db), eventId }),
    db.prepare("SELECT COUNT(*) AS total_requests,COUNT(DISTINCT spotify_track_id) AS unique_tracks_requested,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved,SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,SUM(CASE WHEN status='played' THEN 1 ELSE 0 END) AS played,SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed FROM requests WHERE event_id=?").bind(eventId).first<{ total_requests: number; unique_tracks_requested: number; pending: number; approved: number; queued: number; played: number; rejected: number; failed: number }>(),
    db.prepare("SELECT artist_name,COUNT(*) AS requests FROM requests WHERE event_id=? AND status IN ('pending','approved','queued','played') GROUP BY artist_name ORDER BY requests DESC,artist_name ASC LIMIT 5").bind(eventId).all<{ artist_name: string; requests: number }>(),
  ]);
  const queued = queueRows.results || [];
  const savedOrder = parseOrder(orderSetting?.value);
  const orderIndex = new Map(savedOrder.map((id, index) => [id, index]));
  queued.sort((a, b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    || String(a.queued_at || "").localeCompare(String(b.queued_at || "")));
  const compactChoices = (items: Array<{ label: string; guests: number; share: number }>) =>
    items.slice(0, 8).map(({ label, guests, share }) => ({ label, guests, share }));
  const activityCounts = activity || { total_requests: 0, unique_tracks_requested: 0, pending: 0, approved: 0, queued: 0, played: 0, rejected: 0, failed: 0 };
  const partyQueue: PartyQueueContext = {
    activity: {
      totalRequests: activityCounts.total_requests || 0,
      uniqueTracksRequested: activityCounts.unique_tracks_requested || 0,
      pending: activityCounts.pending || 0,
      approved: activityCounts.approved || 0,
      queued: activityCounts.queued || 0,
      played: activityCounts.played || 0,
      rejected: activityCounts.rejected || 0,
      failed: activityCounts.failed || 0,
      topArtists: (artistRows.results || []).map(row => ({ artist: row.artist_name, requests: row.requests })),
    },
    queued: queued.slice(0, 20).map(row => ({ id: row.id, track: row.track_name + " — " + row.artist_name, durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null })),
    recentlyPlayed: (playedRows.results || []).map(row => ({ track: row.track_name + " — " + row.artist_name, playedAt: row.played_at })),
    audience: {
      respondents: audience.respondents, genres: compactChoices(audience.genres), subgenres: compactChoices(audience.subgenres),
      decades: compactChoices(audience.decades), moods: compactChoices(audience.moods), averageEnergy: audience.averageEnergy,
    },
    crowdFeedback: {
      eligible: crowdFeedback.eligible, respondents: crowdFeedback.respondents, windowMinutes: crowdFeedback.windowMinutes,
      atmosphere: crowdFeedback.atmosphere, averageEnergy: crowdFeedback.averageEnergy,
      trend: crowdFeedback.trend === "negative" || crowdFeedback.trend === "positive" || crowdFeedback.trend === "mixed"
        ? crowdFeedback.trend : "insufficient",
    },
  };
  return { djPreferences: profile?.value ?? null, partyQueue };
}
