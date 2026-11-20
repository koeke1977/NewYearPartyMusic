import type { Env } from "../platform/env";
import { readDjSession } from "../modules/identity/dj-session";
export async function requireDJ(request: Request, env: Env): Promise<boolean> {
  return !!(await readDjSession(request, env.SESSION_SECRET, env.EVENT_ID));
}
