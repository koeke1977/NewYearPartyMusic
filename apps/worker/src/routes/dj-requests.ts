import { Hono } from "hono";
import type { Env } from "../platform/env";
import {
  getDjOverviewFromEnvironment, moderatePartyRequestFromEnvironment,
  reorderDjQueueFromEnvironment, updateDjSettingFromEnvironment,
} from "../platform/composition/dj-request-workflows";
import { requireDJSession } from "./dj-auth";
import { getAudienceIntelligenceFromEnvironment } from "../platform/composition/audience-intelligence-workflows";
import { getCrowdFeedbackFromEnvironment } from "../platform/composition/crowd-feedback-workflows";
import { flushEventFromEnvironment } from "../platform/composition/event-flush-workflow";
import { allowAuthAttempt } from "../platform/composition/auth-attempt-guard";

export const djRequestRoutes = new Hono<{ Bindings: Env }>();

djRequestRoutes.use("/api/dj/*", requireDJSession("DJ-sessie verlopen. Meld opnieuw aan."));

djRequestRoutes.post("/api/dj/event/flush", async (c) => {
  if (!await allowAuthAttempt(c.env, c.req.raw, "dj_login")) {
    return c.json({ error: "Te veel pogingen. Probeer het over 15 minuten opnieuw." }, 429, { "Retry-After": "900" });
  }
  let body: { confirmation?: unknown; code?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: "Ongeldige aanvraag." }, 400); }
  const result = await flushEventFromEnvironment(c.env, body.confirmation, body.code);
  if (!result.ok) {
    const status = result.error === "invalid_code" ? 401 : result.error === "not_configured" ? 503 : 400;
    const messages = {
      confirmation_required: "Typ FLUSH als expliciete bevestiging.",
      invalid_code: "Onjuiste DJ-code. Er is niets gewist.",
      not_configured: "DJ-toegang is niet geconfigureerd.",
    };
    return c.json({ error: messages[result.error] }, status);
  }
  return c.json({ ok: true, message: "Tijdelijke eventgegevens zijn gewist." });
});

djRequestRoutes.get("/api/dj/overview", async (c) => {
  return c.json(await getDjOverviewFromEnvironment(c.env));
});

djRequestRoutes.post("/api/dj/queue/reorder", async (c) => {
  let body: { order?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ongeldige aanvraag." }, 400);
  }
  const result = await reorderDjQueueFromEnvironment(c.env, body.order);
  if (!result.ok) return c.json({ error: result.error.message }, result.error.code === "invalid_order" ? 400 : 409);
  return c.json({ ok: true, order: result.value.order }, 200);
});

djRequestRoutes.post("/api/dj/requests/:id/:action", async (c) => {
  const result = await moderatePartyRequestFromEnvironment(c.env, c.req.param("id"), c.req.param("action"));
  return c.json(result.body, result.status as 200 | 404 | 409);
});

djRequestRoutes.post("/api/dj/settings/:key", async (c) => {
  let body: { enabled?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Ongeldige aanvraag." }, 400);
  }
  const result = await updateDjSettingFromEnvironment(c.env, c.req.param("key"), body.enabled);
  if (!result.ok) return c.json({ error: result.error.message }, 400);
  return c.json({ ok: true, enabled: result.value.enabled }, 200);
});


djRequestRoutes.get("/api/dj/audience", async (c) => {
  return c.json(await getAudienceIntelligenceFromEnvironment(c.env));
});


djRequestRoutes.get("/api/dj/crowd-feedback", async (c) => {
  return c.json(await getCrowdFeedbackFromEnvironment(c.env));
});
