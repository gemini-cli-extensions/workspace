/**
 * @fileoverview Health check route for the ported `HealthPanel` island,
 * ported from `core-gsuite-tools` Phase 3.
 *
 * MOUNTED AT `/api/gsuite-health` (not `/api/health`): this Worker already has
 * a richer `/api/health` (`healthRouter`, D1-persisted runs + per-agent DO
 * pings) with a DIFFERENT response shape. Rather than reshape `HealthPanel`
 * around that schema, this ports the SRC health probe as-is — it reuses
 * `db/health.ts` (`checkD1`) and `utils/health.ts` (`checkSecrets`,
 * `checkEnvVars`), which were already present in this Worker (ported ahead of
 * this phase) but unused by any route until now.
 *
 * Probes all live bindings: D1, KV (SESSIONS), secrets, and env vars. Returns
 * a structured status object suitable for uptime monitors.
 *
 * Route: GET /api/gsuite-health
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { checkD1 } from "@/backend/db/health";
import { checkSecrets, checkEnvVars } from "@/backend/utils/health";

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

/**
 * z.any() for health response: the rich union of ModuleResult subtypes returned
 * by check helpers would cause handler-type mismatch in @hono/zod-openapi if
 * described precisely. Explicit `200 as const` pins _status.
 */
const HealthSchema = z.any();

export const gsuiteHealthRouter = new OpenAPIHono<{ Bindings: Env }>();

gsuiteHealthRouter.openapi(createRoute({
  method: "get", path: "/",
  tags: ["Health"], summary: "Live binding health probe (ported gsuite hub)", operationId: "gsuiteHealthCheck",
  responses: {
    200: { description: "Health status", content: { "application/json": { schema: HealthSchema } } },
    500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
  },
}), async (c) => {
  const [d1, kv, secrets, env] = await Promise.all([
    checkD1(c.env),
    // SESSIONS binding is the relevant KV for health checking
    (async () => {
      const start = Date.now();
      try {
        await c.env.SESSIONS.get("__health");
        return { status: "ok" as const, latencyMs: Date.now() - start };
      } catch (e) {
        return { status: "fail" as const, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
      }
    })(),
    checkSecrets(c.env),
    checkEnvVars(c.env),
  ]);

  const allOk = [d1, kv, secrets, env].every(r => r.status === "ok");
  const anyFail = [d1, kv, secrets, env].some(r => r.status === "fail");

  return c.json({
    status: allOk ? "ok" : anyFail ? "fail" : "degraded",
    timestamp: new Date().toISOString(),
    checks: { d1, kv, secrets, env },
  } as any, 200);
});
