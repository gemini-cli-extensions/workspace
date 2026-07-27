/**
 * @fileoverview Admin control surface for the billing circuit breaker
 * (`src/backend/circuit-breaker.ts`). Mounted at `/api/admin/circuit`.
 *
 *  GET  /            → current status
 *  POST /trip         → manually trip (kill switch), body `{ reason? }`
 *  POST /reset        → clear open + counters (stand back up)
 *
 * This is the one `/api/admin/*` surface that must stay reachable while the
 * breaker is open (the hot-path guard in `src/_worker.ts` exempts
 * `/api/admin/circuit`), and it must also be reachable when the admin session
 * cookie isn't available — that's the whole point of a kill switch. So on top
 * of the blanket `/api/admin/*` cookie gate (`authMiddleware`, applied in
 * `api/index.ts`), this router carries its own middleware that ALSO accepts a
 * constant-time `Authorization: Bearer <WORKER_API_KEY>` (same pattern as
 * `middleware/agent-auth.ts`). It's mounted in `api/index.ts` BEFORE the
 * blanket cookie gate is registered, so for `/api/admin/circuit/*` requests
 * this middleware runs instead of being short-circuited by the cookie-only
 * one.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { getBreaker } from "@/backend/circuit-breaker";
import { verifySessionCookie } from "@/backend/lib/cookies";
import { constantTimeEqual } from "@/backend/lib/crypto";
import { getWorkerApiKey } from "@/backend/utils/secrets";

export const circuitRouter = new OpenAPIHono<{ Bindings: Env }>();

circuitRouter.use("*", async (c, next) => {
  const session = await verifySessionCookie(c.env, c.req.header("Cookie"));
  if (session) {
    await next();
    return;
  }

  const bearer = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) {
    const workerKey = await getWorkerApiKey(c.env);
    if (workerKey && constantTimeEqual(bearer, workerKey)) {
      await next();
      return;
    }
  }

  return c.json({ error: "Unauthorized" }, 401);
});

const statusSchema = z.object({
  open: z.boolean(),
  reason: z.string().optional(),
  trippedAt: z.number().optional(),
  counts: z.record(z.string(), z.number()),
});

const openResultSchema = z.object({ open: z.boolean() });

circuitRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "circuitStatus",
    summary: "Billing circuit breaker status",
    tags: ["Admin"],
    responses: {
      200: { description: "Status", content: { "application/json": { schema: statusSchema } } },
    },
  }),
  async (c) => {
    const status = await getBreaker(c.env).status();
    return c.json(status, 200);
  },
);

circuitRouter.openapi(
  createRoute({
    method: "post",
    path: "/trip",
    operationId: "circuitTrip",
    summary: "Manually trip the circuit breaker (kill switch)",
    tags: ["Admin"],
    request: {
      body: {
        content: { "application/json": { schema: z.object({ reason: z.string().optional() }) } },
        required: false,
      },
    },
    responses: {
      200: { description: "Tripped", content: { "application/json": { schema: openResultSchema } } },
    },
  }),
  async (c) => {
    const body = await c.req.json().catch(() => ({}) as { reason?: string });
    const result = await getBreaker(c.env).trip(
      body.reason ?? "manual: tripped via /api/admin/circuit/trip",
    );
    return c.json(result, 200);
  },
);

circuitRouter.openapi(
  createRoute({
    method: "post",
    path: "/reset",
    operationId: "circuitReset",
    summary: "Reset the circuit breaker (stand back up)",
    tags: ["Admin"],
    responses: {
      200: { description: "Reset", content: { "application/json": { schema: openResultSchema } } },
    },
  }),
  async (c) => {
    const result = await getBreaker(c.env).reset();
    return c.json(result, 200);
  },
);
