import { MUSIC_DECADES, MUSIC_GENRES, MUSIC_MOODS } from "../domain/genre-taxonomy";

export type GuestMusicPreferences = {
  genreIds: string[];
  decadeIds: string[];
  moodIds: string[];
  energy: number | null;
};

export type GuestMusicPreferenceRepository = {
  save(input: { guestId: string; eventId: string; preferences: GuestMusicPreferences }): Promise<void>;
};

const genreIds = new Set(MUSIC_GENRES.flatMap(genre => [genre.id, ...genre.subgenres.map(item => item.id)]));
const decadeIds = new Set<string>(MUSIC_DECADES.map(item => item.id));
const moodIds = new Set<string>(MUSIC_MOODS);

function uniqueAllowed(values: unknown, allowed: Set<string>, maximum: number): string[] | null {
  if (!Array.isArray(values) || values.length > maximum || values.some(value => typeof value !== "string")) return null;
  const result = [...new Set(values)];
  if (result.some(value => !allowed.has(value))) return null;
  return result;
}

export function validateGuestMusicPreferences(value: unknown): GuestMusicPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const genres = uniqueAllowed(input.genreIds, genreIds, 30);
  const decades = uniqueAllowed(input.decadeIds ?? [], decadeIds, 7);
  const moods = uniqueAllowed(input.moodIds ?? [], moodIds, 5);
  const energy = input.energy === undefined || input.energy === null
    ? null
    : Number.isInteger(input.energy) && Number(input.energy) >= 1 && Number(input.energy) <= 10
      ? Number(input.energy) : Number.NaN;
  if (!genres || genres.length === 0 || !decades || !moods || Number.isNaN(energy)) return null;
  return { genreIds: genres, decadeIds: decades, moodIds: moods, energy };
}

export async function saveGuestMusicPreferences(input: {
  repository: GuestMusicPreferenceRepository;
  guestId: string;
  eventId: string;
  preferences: unknown;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const preferences = validateGuestMusicPreferences(input.preferences);
  if (!preferences) return { ok: false, message: "Kies minstens één muziekstijl en controleer je keuzes." };
  await input.repository.save({ guestId: input.guestId, eventId: input.eventId, preferences });
  return { ok: true };
}
