import { createMiddleware } from "hono/factory";
import type { Env } from "../platform/env";
import { readDjSession } from "../modules/identity/dj-session";
import { readSession } from "../platform/composition/session-token";

export async function requireDJ(request: Request, env: Env): Promise<boolean> {
  return !!(await readDjSession(request, env.SESSION_SECRET, env.EVENT_ID, readSession));
}

export function requireDJSession(message = "DJ-sessie verlopen.") {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    if (!await requireDJ(c.req.raw, c.env)) {
      return c.json({ error: message }, 401);
    }
    await next();
  });
}
