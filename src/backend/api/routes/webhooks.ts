/**
 * @fileoverview Webhooks REST API router.
 *
 * Full CRUD over the `webhooks` D1 table plus a test-fire action that updates
 * lastStatus and lastTriggeredAt without actually sending an HTTP request.
 *
 * Mount this router at `/api/webhooks` in `api/index.ts`.
 *
 * Route inventory:
 *   GET    /          – list webhooks (limit, offset)
 *   POST   /          – create webhook (auto-generates a signing secret if omitted)
 *   GET    /{id}      – get webhook by id
 *   PATCH  /{id}      – partial update
 *   DELETE /{id}      – hard delete
 *   POST   /{id}/test – simulate a delivery: sets lastStatus='200 OK', lastTriggeredAt=now
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc, eq, sql } from "drizzle-orm";

import { getDb } from "../../db";
import { selectWebhookSchema, webhooks } from "../../db/schema";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const webhookIdParam = z.object({ id: z.string().min(1) });
const notFoundSchema = z.object({ error: z.string() });

const webhookListQuerySchema = z.object({
  limit: z.string().optional().openapi({ description: "Max rows (default 50)." }),
  offset: z.string().optional().openapi({ description: "Skip rows for pagination (default 0)." }),
});

/** Create body — id and createdAt are server-generated. Secret is auto-generated if omitted. */
const createWebhookBody = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).optional().openapi({ description: "Event type strings to subscribe to." }),
  secret: z.string().optional().openapi({ description: "HMAC signing secret; auto-generated if omitted." }),
  active: z.boolean().optional(),
});

const patchWebhookBody = createWebhookBody.partial();

const webhookListResponse = z.object({
  data: z.array(selectWebhookSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

const deleteResponseSchema = z.object({ ok: z.boolean() });

const testResponseSchema = z.object({
  ok: z.boolean(),
  lastStatus: z.string(),
  lastTriggeredAt: z.number().nullable(),
});

/** Generate a 32-byte hex signing secret using the Web Crypto API. */
async function generateSecret(): Promise<string> {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const webhooksRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

webhooksRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Webhooks"],
    summary: "List webhooks",
    operationId: "webhooksList",
    request: { query: webhookListQuerySchema },
    responses: {
      200: {
        description: "Paginated list of webhooks.",
        content: { "application/json": { schema: webhookListResponse } },
      },
    },
  }),
  async (c) => {
    const { limit: lStr, offset: oStr } = c.req.valid("query");
    const limit = Math.min(parseInt(lStr ?? "50", 10) || 50, 200);
    const offset = parseInt(oStr ?? "0", 10) || 0;
    const db = getDb(c.env);

    const [rows, countResult] = await Promise.all([
      db.select().from(webhooks).orderBy(desc(webhooks.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(webhooks),
    ]);

    return c.json({ data: rows, total: countResult[0]?.count ?? 0, limit, offset }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

webhooksRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Webhooks"],
    summary: "Create webhook (auto-generates signing secret if not provided)",
    operationId: "webhooksCreate",
    request: {
      body: { content: { "application/json": { schema: createWebhookBody } } },
    },
    responses: {
      201: {
        description: "Created webhook.",
        content: { "application/json": { schema: selectWebhookSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const secret = body.secret ?? (await generateSecret());
    const db = getDb(c.env);
    const [row] = await db
      .insert(webhooks)
      .values({
        name: body.name,
        url: body.url,
        events: body.events ?? [],
        secret,
        active: body.active ?? true,
        createdAt: new Date(),
      })
      .returning();
    return c.json(row!, 201);
  },
);

// ---------------------------------------------------------------------------
// GET /{id}
// ---------------------------------------------------------------------------

webhooksRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Webhooks"],
    summary: "Get webhook by ID",
    operationId: "webhooksGet",
    request: { params: webhookIdParam },
    responses: {
      200: {
        description: "Webhook record.",
        content: { "application/json": { schema: selectWebhookSchema } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const [row] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
    if (!row) {
      return c.json({ error: "Webhook not found." }, 404);
    }
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// PATCH /{id}
// ---------------------------------------------------------------------------

webhooksRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["Webhooks"],
    summary: "Partial update webhook",
    operationId: "webhooksPatch",
    request: {
      params: webhookIdParam,
      body: { content: { "application/json": { schema: patchWebhookBody } } },
    },
    responses: {
      200: {
        description: "Updated webhook.",
        content: { "application/json": { schema: selectWebhookSchema } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const [row] = await db
      .update(webhooks)
      .set(body)
      .where(eq(webhooks.id, id))
      .returning();
    if (!row) {
      return c.json({ error: "Webhook not found." }, 404);
    }
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// DELETE /{id}
// ---------------------------------------------------------------------------

webhooksRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Webhooks"],
    summary: "Delete webhook",
    operationId: "webhooksDelete",
    request: { params: webhookIdParam },
    responses: {
      200: {
        description: "Deletion confirmation.",
        content: { "application/json": { schema: deleteResponseSchema } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const result = await db
      .delete(webhooks)
      .where(eq(webhooks.id, id))
      .returning({ id: webhooks.id });
    if (result.length === 0) {
      return c.json({ error: "Webhook not found." }, 404);
    }
    return c.json({ ok: true }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /{id}/test
// ---------------------------------------------------------------------------

webhooksRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/test",
    tags: ["Webhooks"],
    summary: "Simulate a webhook delivery (sets lastStatus=200 OK, lastTriggeredAt=now)",
    operationId: "webhooksTest",
    request: { params: webhookIdParam },
    responses: {
      200: {
        description: "Test delivery result.",
        content: { "application/json": { schema: testResponseSchema } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const now = new Date();
    const [row] = await db
      .update(webhooks)
      .set({ lastStatus: "200 OK", lastTriggeredAt: now })
      .where(eq(webhooks.id, id))
      .returning({
        id: webhooks.id,
        lastStatus: webhooks.lastStatus,
        lastTriggeredAt: webhooks.lastTriggeredAt,
      });
    if (!row) {
      return c.json({ error: "Webhook not found." }, 404);
    }
    return c.json(
      {
        ok: true,
        lastStatus: row.lastStatus ?? "200 OK",
        lastTriggeredAt: row.lastTriggeredAt ? row.lastTriggeredAt.getTime() : null,
      },
      200,
    );
  },
);
