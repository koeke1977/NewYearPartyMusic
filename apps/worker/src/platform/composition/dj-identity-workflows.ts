import type { Env } from "../env";
import { sha256 } from "../security/crypto";
import { createSessionToken } from "../../modules/identity/session-token";
import { loginDj } from "../../modules/identity/dj-session";

/** Composes DJ login policy with the platform hashing and signed-token adapters. */
export function loginDjFromEnvironment(env: Env, code: string) {
  return loginDj({
    code,
    expectedCodeHash: env.DJ_ACCESS_CODE_HASH,
    sessionSecret: env.SESSION_SECRET,
    eventId: env.EVENT_ID,
    hashCode: sha256,
    createToken: createSessionToken,
    nowSeconds: () => Math.floor(Date.now() / 1000),
  });
}
