import { MUSIC_GENRES } from "../domain/genre-taxonomy";

export type AudiencePreferenceRow = {
  genre_ids_json: string;
  decade_ids_json: string;
  mood_ids_json: string;
  energy: number | null;
};

export type AudienceIntelligenceRepository = {
  readEventPreferences(eventId: string): Promise<AudiencePreferenceRow[]>;
};

type CountedChoice = { id: string; label: string; guests: number; share: number; balancedWeight: number };

function parseIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? [...new Set(parsed.filter((item): item is string => typeof item === "string"))] : [];
  } catch {
    return [];
  }
}

function distributeWithCap(counts: number[], cap: number): number[] {
  if (!counts.length) return [];
  const weights = counts.map(value => Math.max(0, value));
  const result = weights.map(() => 0);
  let remaining = 1;
  let open = weights.map((_, index) => index);
  while (open.length) {
    const openTotal = open.reduce((sum, index) => sum + weights[index], 0);
    if (!openTotal) break;
    const capped = open.filter(index => remaining * weights[index] / openTotal > cap);
    if (!capped.length) {
      for (const index of open) result[index] = remaining * weights[index] / openTotal;
      break;
    }
    for (const index of capped) {
      result[index] = cap;
      remaining -= cap;
    }
    const cappedSet = new Set(capped);
    open = open.filter(index => !cappedSet.has(index));
  }
  return result;
}

function choicesFromCounts(counts: Map<string, Set<number>>, labels: Map<string, string>, respondents: number, cap = 0.35): CountedChoice[] {
  const entries = [...counts.entries()].map(([id, guests]) => ({ id, guests: guests.size, label: labels.get(id) || id }))
    .filter(item => item.guests > 0)
    .sort((a, b) => b.guests - a.guests || a.label.localeCompare(b.label));
  const balanced = distributeWithCap(entries.map(item => item.guests), cap);
  return entries.map((item, index) => ({
    ...item,
    share: respondents ? Number((item.guests / respondents).toFixed(4)) : 0,
    balancedWeight: Number((balanced[index] || 0).toFixed(4)),
  }));
}

export async function getAudienceIntelligence(input: {
  repository: AudienceIntelligenceRepository;
  eventId: string;
}): Promise<{
  eventId: string;
  respondents: number;
  genres: CountedChoice[];
  subgenres: CountedChoice[];
  decades: CountedChoice[];
  moods: CountedChoice[];
  averageEnergy: number | null;
}> {
  const rows = await input.repository.readEventPreferences(input.eventId);
  const genreParent = new Map<string, string>();
  const genreLabels = new Map<string, string>();
  const subgenreLabels = new Map<string, string>();
  for (const genre of MUSIC_GENRES) {
    genreParent.set(genre.id, genre.id);
    genreLabels.set(genre.id, genre.label);
    for (const subgenre of genre.subgenres) {
      genreParent.set(subgenre.id, genre.id);
      subgenreLabels.set(subgenre.id, subgenre.label);
    }
  }

  const genreCounts = new Map<string, Set<number>>();
  const subgenreCounts = new Map<string, Set<number>>();
  const decadeCounts = new Map<string, Set<number>>();
  const moodCounts = new Map<string, Set<number>>();
  const decadeLabels = new Map([["60s", "60s"], ["70s", "70s"], ["80s", "80s"], ["90s", "90s"], ["00s", "00s"], ["10s", "10s"], ["20s", "20s"]]);
  const moodNames = ["feel-good", "nostalgic", "energetic", "romantic", "dark", "playful", "anthemic", "laid-back", "singalong", "unexpected"];
  const moodNamesById = new Map(moodNames.map(id => [id, id]));
  let energyTotal = 0;
  let energyResponses = 0;

  rows.forEach((row, index) => {
    const selectedGenres = parseIds(row.genre_ids_json);
    const selectedParents = new Set<string>();
    for (const id of selectedGenres) {
      const parent = genreParent.get(id);
      if (!parent) continue;
      selectedParents.add(parent);
      if (id !== parent) {
        if (!subgenreCounts.has(id)) subgenreCounts.set(id, new Set());
        subgenreCounts.get(id)!.add(index);
      }
    }
    for (const id of selectedParents) {
      if (!genreCounts.has(id)) genreCounts.set(id, new Set());
      genreCounts.get(id)!.add(index);
    }
    for (const id of parseIds(row.decade_ids_json)) {
      if (!decadeCounts.has(id)) decadeCounts.set(id, new Set());
      decadeCounts.get(id)!.add(index);
    }
    for (const id of parseIds(row.mood_ids_json)) {
      if (!moodCounts.has(id)) moodCounts.set(id, new Set());
      moodCounts.get(id)!.add(index);
    }
    if (typeof row.energy === "number" && Number.isFinite(row.energy)) {
      energyTotal += row.energy;
      energyResponses += 1;
    }
  });

  return {
    eventId: input.eventId,
    respondents: rows.length,
    genres: choicesFromCounts(genreCounts, genreLabels, rows.length),
    subgenres: choicesFromCounts(subgenreCounts, subgenreLabels, rows.length),
    decades: choicesFromCounts(decadeCounts, decadeLabels, rows.length),
    moods: choicesFromCounts(moodCounts, moodNamesById, rows.length),
    averageEnergy: energyResponses ? Number((energyTotal / energyResponses).toFixed(1)) : null,
  };
}
