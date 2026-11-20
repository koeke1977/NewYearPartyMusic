export type AuthAttemptScope = "guest_join" | "dj_login";

export const AUTH_ATTEMPT_POLICIES: Record<AuthAttemptScope, { maxAttempts: number; windowSeconds: number }> = {
  // Allows a large group behind one venue Wi-Fi/NAT while slowing event-code guessing.
  guest_join: { maxAttempts: 120, windowSeconds: 15 * 60 },
  // DJ access is used by one operator; keep this deliberately tighter.
  dj_login: { maxAttempts: 10, windowSeconds: 15 * 60 },
};
