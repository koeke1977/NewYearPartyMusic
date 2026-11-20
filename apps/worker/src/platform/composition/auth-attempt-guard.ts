import type { Env } from "../env";
import { AUTH_ATTEMPT_POLICIES, type AuthAttemptScope } from "../../modules/identity/domain/auth-attempt-policy";
import { consumeAuthAttempt } from "../infrastructure/auth-attempt-d1-repository";
import { signPayload } from "../security/crypto";

/** Uses Cloudflare's trusted client-IP header; never stores a raw IP address. */
export async function allowAuthAttempt(
  env: Env,
  request: Request,
  scope: AuthAttemptScope,
): Promise<boolean> {
  const policy = AUTH_ATTEMPT_POLICIES[scope];
  if (!env.SESSION_SECRET) return true;
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (!clientIp) return env.APP_ENV !== "production";
  const ipHash = await signPayload(scope + ":" + clientIp, env.SESSION_SECRET);
  return consumeAuthAttempt(env.DB, scope, ipHash, policy.maxAttempts, policy.windowSeconds);
}
