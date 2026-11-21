import type { Env } from "../env";
import { saveGuestMusicPreferences } from "../../modules/music/application/guest-music-preferences";
import { createGuestMusicPreferenceRepository } from "../../modules/music/infrastructure/guest-music-preference-d1-repository";

export function saveGuestPreferencesFromEnvironment(env: Env, guestId: string, preferences: unknown) {
  return saveGuestMusicPreferences({
    repository: createGuestMusicPreferenceRepository(env.DB),
    guestId,
    eventId: env.EVENT_ID,
    preferences,
  });
}
