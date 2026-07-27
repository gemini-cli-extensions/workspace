/**
 * @fileoverview Action-catalog route (ported from `core-gsuite-tools` Phase 3).
 *
 * Exposes the schedulable action catalog (`ACTION_CATALOG`, ported in Phase 2)
 * that drives the Tasks scheduling wizard's Action and Parameters steps.
 *
 * Routes:
 *  GET /api/catalog — `{ data: AgentCatalogEntry[] }`
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { ACTION_CATALOG } from "@/backend/ai/agents/shared/action-catalog";

/** z.any() avoids over-specifying the nested catalog shape in the OpenAPI doc. */
const AnySchema = z.any();

export const catalogRouter = new OpenAPIHono<{ Bindings: Env }>();

catalogRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Catalog"],
    summary: "List the schedulable action catalog",
    operationId: "gsuiteCatalogList",
    responses: {
      200: {
        description: "Catalog",
        content: { "application/json": { schema: z.object({ data: z.array(AnySchema) }) } },
      },
    },
  }),
  (c) => {
    return c.json({ data: Object.values(ACTION_CATALOG) } as { data: any[] }, 200);
  },
);
