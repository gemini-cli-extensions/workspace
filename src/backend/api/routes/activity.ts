/**
 * @fileoverview Activity Log REST API router + logActivity helper.
 *
 * Provides read-only access to the append-only `activity_log` table.
 * Also exports `logActivity()` — a lightweight helper that other route files
 * can import to fire-and-forget an audit log insert via `waitUntil()`.
 *
 * Mount this router at `/api/activity` in `api/index.ts`.
 *
 * Route inventory:
 *   GET /  – list activity log (q, entityType, actor, limit, offset; sorted desc by createdAt)
 *
 * Helper export:
 *   logActivity(env, opts) – inserts a single activity_log row; never throws.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq, like, or, sql } from "drizzle-orm";

import { getDb } from "../../db";
import { activityLog, selectActivityLogSchema } from "../../db/schema";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const activityListQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .openapi({ description: "Full-text search on summary, action, actor." }),
  entityType: z
    .string()
    .optional()
    .openapi({ description: "Filter by entity type (e.g. project, task, note)." }),
  actor: z.string().optional().openapi({ description: "Filter by actor display name." }),
  limit: z
    .string()
    .optional()
    .openapi({ description: "Max rows to return (default 50)." }),
  offset: z
    .string()
    .optional()
    .openapi({ description: "Rows to skip for pagination (default 0)." }),
});

const activityListResponse = z.object({
  data: z.array(selectActivityLogSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

// ---------------------------------------------------------------------------
// logActivity helper
// ---------------------------------------------------------------------------

/** Options for inserting a single activity log entry. */
export interface LogActivityOptions {
  /** Who performed the action (defaults to 'system'). */
  actor?: string;
  /** Verb describing what happened (e.g. 'created', 'deleted', 'updated'). */
  action: string;
  /** Type of entity targeted (e.g. 'project', 'task', 'note'). */
  entityType: string;
  /** ID of the targeted entity (optional). */
  entityId?: string;
  /** Human-readable sentence summarising the event. */
  summary: string;
  /** Extra context as a plain JSON object. */
  metadata?: Record<string, unknown>;
}

/**
 * Insert a single row into `activity_log`.
 *
 * Designed for fire-and-forget use in route handlers. Never throws — any error
 * is swallowed and logged to the console so it never breaks the primary
 * request path.
 *
 * @example
 * ```ts
 * c.executionCtx.waitUntil(
 *   logActivity(c.env, {
 *     action: "created",
 *     entityType: "project",
 *     entityId: project.id,
 *     summary: `Created project "${project.name}"`,
 *   }),
 * );
 * ```
 */
export async function logActivity(env: Env, opts: LogActivityOptions): Promise<void> {
  try {
    const db = getDb(env);
    await db.insert(activityLog).values({
      actor: opts.actor ?? "system",
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      summary: opts.summary,
      metadata: opts.metadata ?? {},
      createdAt: new Date(),
    });
  } catch (err) {
    console.error(
      JSON.stringify({ level: "ERROR", helper: "logActivity", error: String(err) }),
    );
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const activityRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

activityRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Activity"],
    summary: "List activity log entries (newest first)",
    operationId: "activityList",
    request: { query: activityListQuerySchema },
    responses: {
      200: {
        description: "Paginated activity log sorted descending by createdAt.",
        content: { "application/json": { schema: activityListResponse } },
      },
    },
  }),
  async (c) => {
    const { q, entityType, actor, limit: lStr, offset: oStr } = c.req.valid("query");
    const limit = Math.min(parseInt(lStr ?? "50", 10) || 50, 200);
    const offset = parseInt(oStr ?? "0", 10) || 0;
    const db = getDb(c.env);

    const conditions = [];
    if (q) {
      conditions.push(
        or(
          like(activityLog.summary, `%${q}%`),
          like(activityLog.action, `%${q}%`),
          like(activityLog.actor, `%${q}%`),
        ),
      );
    }
    if (entityType) conditions.push(eq(activityLog.entityType, entityType));
    if (actor) conditions.push(eq(activityLog.actor, actor));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(activityLog)
        .where(where)
        .orderBy(desc(activityLog.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(activityLog).where(where),
    ]);

    return c.json({ data: rows, total: countResult[0]?.count ?? 0, limit, offset }, 200);
  },
);
