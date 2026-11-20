import { createMiddleware } from "hono/factory";
import type { Env } from "../platform/env";
import { readDjSession } from "../modules/identity/dj-session";

export async function requireDJ(request: Request, env: Env): Promise<boolean> {
  return !!(await readDjSession(request, env.SESSION_SECRET, env.EVENT_ID));
}

export const requireDJSession = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (!await requireDJ(c.req.raw, c.env)) {
    return c.json({ error: "DJ-sessie verlopen." }, 401);
  }
  await next();
});
