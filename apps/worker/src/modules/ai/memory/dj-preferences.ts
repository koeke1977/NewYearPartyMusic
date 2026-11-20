const EXPLICIT_PREFERENCE_PATTERN = /\b(onthoud|vanaf nu|voortaan|mijn voorkeur|ik wil altijd|ik hou van|ik houd van|ik verkies)\b/i;

export type RememberPreferenceResult = {
  preferences: string[];
  updated: boolean;
};

export function parseDJPreferences(value: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(-20)
      : [];
  } catch {
    return [];
  }
}

/**
 * Persists only explicit, user-authored preference statements.
 * The caller owns storage; this module remains deterministic and side-effect free.
 */
export function rememberDJPreference(
  storedValue: string | null | undefined,
  prompt: string,
): RememberPreferenceResult {
  const preferences = parseDJPreferences(storedValue);
  if (!EXPLICIT_PREFERENCE_PATTERN.test(prompt)) return { preferences, updated: false };

  const preference = prompt.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!preference || preferences.includes(preference)) return { preferences, updated: false };

  return { preferences: [...preferences, preference].slice(-20), updated: true };
}
