/**
 * @fileoverview Chat threads API routes (ported from `core-gsuite-tools`
 * Phase 3). Backs the `ChatLanding` sidebar: each row's opaque `key` doubles
 * as the `OrchestratorAgent` Durable Object instance name
 * (`/agents/orchestrator-agent/<key>`).
 *
 * Routes:
 *  GET    /api/threads         — List threads for a session key
 *  POST   /api/threads         — Create a thread (mints an opaque DO `key`)
 *  GET    /api/threads/:id     — Get a thread
 *  PATCH  /api/threads/:id     — Rename a thread
 *  DELETE /api/threads/:id     — Delete a thread (cascades to its messages)
 */

import { threads, selectThreadSchema, insertThreadSchema } from "@db/schemas";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq, desc } from "drizzle-orm";

import { getDb } from "@/backend/db";

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

/**
 * Parse a `:id` path param into a positive integer thread id, or null when it is
 * not a valid number. The `:id` route param is a free-form string, so a request
 * like `/api/threads/abc` would otherwise reach the DB as `NaN` and produce an
 * opaque driver error — callers validate the result and return 400 instead.
 */
function parseThreadId(id: string): number | null {
  const n = Number.parseInt(id, 10);
  return Number.isInteger(n) ? n : null;
}

export const threadsRouter = new OpenAPIHono<{ Bindings: Env }>();

// GET /api/threads
threadsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Threads"],
    summary: "List threads",
    operationId: "gsuiteThreadsList",
    request: {
      query: z.object({
        sessionKey: z.string().optional(),
        limit: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Threads",
        content: { "application/json": { schema: z.object({ data: z.array(z.any()) }) } },
      },
      500: {
        description: "Server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    const { sessionKey, limit } = c.req.valid("query");
    const db = getDb(c.env);
    let rows;
    if (sessionKey) {
      rows = await db
        .select()
        .from(threads)
        .where(eq(threads.sessionKey, sessionKey))
        .orderBy(desc(threads.updatedAt))
        .limit(limit ? parseInt(limit, 10) : 50);
    } else {
      rows = await db
        .select()
        .from(threads)
        .orderBy(desc(threads.updatedAt))
        .limit(limit ? parseInt(limit, 10) : 50);
    }
    return c.json({ data: rows } as { data: any[] }, 200);
  },
);

// POST /api/threads
threadsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Threads"],
    summary: "Create a thread",
    operationId: "gsuiteThreadsCreate",
    request: {
      body: {
        content: {
          "application/json": {
            // `key` is minted server-side (opaque DO instance name), so it is not
            // accepted from the client.
            schema: insertThreadSchema.omit({
              id: true,
              key: true,
              createdAt: true,
              updatedAt: true,
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Thread",
        content: { "application/json": { schema: z.object({ data: z.any() }) } },
      },
      400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
      500: {
        description: "Server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const now = new Date();
    // Mint the opaque DO instance key here so the integer PK is never used as a
    // routable identifier and clients can connect the agent at /agents/.../<key>.
    const key = crypto.randomUUID();
    const result = await db
      .insert(threads)
      .values({ ...body, key, createdAt: now, updatedAt: now })
      .returning();
    return c.json({ data: result[0] } as { data: any }, 200);
  },
);

// GET /api/threads/:id
threadsRouter.openapi(
  createRoute({
    method: "get",
    path: "/:id",
    tags: ["Threads"],
    summary: "Get a thread",
    operationId: "gsuiteThreadsGet",
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      200: {
        description: "Thread",
        content: { "application/json": { schema: z.object({ data: z.any() }) } },
      },
      400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
      404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
      500: {
        description: "Server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const threadId = parseThreadId(id);
    if (threadId === null) {
      return c.json(
        { error: { code: "BAD_REQUEST", message: `Invalid thread id "${id}"` } } as {
          error: { code: string; message: string };
        },
        400,
      );
    }
    const db = getDb(c.env);
    const rows = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
    if (!rows.length) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Thread ${id} not found` } } as {
          error: { code: string; message: string };
        },
        404,
      );
    }
    return c.json({ data: rows[0] } as { data: any }, 200);
  },
);

// PATCH /api/threads/:id — rename a thread.
threadsRouter.openapi(
  createRoute({
    method: "patch",
    path: "/:id",
    tags: ["Threads"],
    summary: "Rename a thread",
    operationId: "gsuiteThreadsRename",
    request: {
      params: z.object({ id: z.string().min(1) }),
      body: {
        content: { "application/json": { schema: z.object({ title: z.string().min(1) }) } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Thread",
        content: { "application/json": { schema: z.object({ data: z.any() }) } },
      },
      400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
      404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
      500: {
        description: "Server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { title } = c.req.valid("json");
    const threadId = parseThreadId(id);
    if (threadId === null) {
      return c.json(
        { error: { code: "BAD_REQUEST", message: `Invalid thread id "${id}"` } } as {
          error: { code: string; message: string };
        },
        400,
      );
    }
    const db = getDb(c.env);
    const result = await db
      .update(threads)
      .set({ title, updatedAt: new Date() })
      .where(eq(threads.id, threadId))
      .returning();
    if (!result.length) {
      return c.json(
        { error: { code: "NOT_FOUND", message: `Thread ${id} not found` } } as {
          error: { code: string; message: string };
        },
        404,
      );
    }
    return c.json({ data: result[0] } as { data: any }, 200);
  },
);

// DELETE /api/threads/:id — delete a thread (messages cascade via FK).
threadsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/:id",
    tags: ["Threads"],
    summary: "Delete a thread",
    operationId: "gsuiteThreadsDelete",
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      200: {
        description: "Deleted",
        content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
      },
      400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
      500: {
        description: "Server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const threadId = parseThreadId(id);
    if (threadId === null) {
      return c.json(
        { error: { code: "BAD_REQUEST", message: `Invalid thread id "${id}"` } } as {
          error: { code: string; message: string };
        },
        400,
      );
    }
    const db = getDb(c.env);
    await db.delete(threads).where(eq(threads.id, threadId));
    return c.json({ ok: true } as const, 200);
  },
);

// Re-export schema for use by other modules
export { selectThreadSchema };
