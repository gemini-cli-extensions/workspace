/**
 * @fileoverview Task-hierarchy sub-router — parent/child (subtask) navigation
 * for the self-referential `tasks.parentId` relationship, mounted alongside
 * {@link tasksRouter} under `/api/tasks`.
 *
 * Split out of `tasks.ts` to keep both files under the 400-line cap. Routes:
 *
 *   GET /{id}/children   – direct child tasks (full rows) where parentId = id
 *   GET /{id}/ancestors  – ordered root→parent chain of {id, title} for breadcrumbs
 *
 * The reusable hierarchy helpers (existence check, ancestor walk, cycle guard)
 * live here and are imported by `tasks.ts` for its POST/PATCH parentId
 * validation, so the cycle-guard logic has exactly one implementation.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { asc, eq } from "drizzle-orm";

import { getDb } from "../../db";
import { selectTaskSchema, tasks } from "../../db/schema";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const taskIdParam = z.object({ id: z.string().min(1) });
const notFoundSchema = z.object({ error: z.string() });

/** One breadcrumb hop — the minimal shape the UI needs to render a crumb. */
const ancestorSchema = z.object({
  id: z.string(),
  title: z.string(),
});

const childrenResponse = z.object({ data: z.array(selectTaskSchema) });
const ancestorsResponse = z.object({
  data: z
    .array(ancestorSchema)
    .openapi({ description: "Ordered root → immediate parent. Empty for a top-level task." }),
});

/**
 * Max number of ancestor hops we will walk before bailing. Guards against a
 * corrupted cycle in the parentId chain (which the write-side cycle guard is
 * meant to prevent, but we defend here too so a read can never loop forever).
 */
export const MAX_ANCESTOR_DEPTH = 20;

// ---------------------------------------------------------------------------
// Reusable hierarchy helpers (also imported by tasks.ts)
// ---------------------------------------------------------------------------

/** Fetch a task's `{ id, parentId }` or `null` if it does not exist. */
async function getIdAndParent(
  env: Env,
  id: string,
): Promise<{ id: string; parentId: string | null } | null> {
  const db = getDb(env);
  const [row] = await db
    .select({ id: tasks.id, parentId: tasks.parentId })
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Walk the parent chain upward from `startId`, returning ordered
 * `{ id, title }` hops from **root → immediate parent** (excluding the task
 * itself). Stops at the first `null` parent, at {@link MAX_ANCESTOR_DEPTH}, or
 * if a node is revisited (cycle guard), so it always terminates.
 *
 * Returns `null` if `startId` does not exist so callers can emit a 404.
 */
export async function walkAncestors(
  env: Env,
  startId: string,
): Promise<{ id: string; title: string }[] | null> {
  const db = getDb(env);
  const start = await getIdAndParent(env, startId);
  if (!start) return null;

  const chain: { id: string; title: string }[] = [];
  const seen = new Set<string>([startId]);
  let cursor = start.parentId;

  for (let depth = 0; cursor && depth < MAX_ANCESTOR_DEPTH; depth++) {
    if (seen.has(cursor)) break; // cycle guard — never loop
    seen.add(cursor);
    const [row] = await db
      .select({ id: tasks.id, title: tasks.title, parentId: tasks.parentId })
      .from(tasks)
      .where(eq(tasks.id, cursor))
      .limit(1);
    if (!row) break; // dangling parentId (e.g. parent deleted) — stop cleanly
    chain.push({ id: row.id, title: row.title });
    cursor = row.parentId;
  }

  // Collected immediate-parent → root; reverse so callers get root → parent.
  chain.reverse();
  return chain;
}

/**
 * Decide whether linking `taskId` under `proposedParentId` would create a
 * cycle. Returns a machine-readable reason when the link must be rejected, or
 * `null` when the link is safe.
 *
 * A link is rejected when:
 *  - the proposed parent is the task itself, or
 *  - the proposed parent does not exist, or
 *  - the task is already an ancestor of the proposed parent (i.e. the proposed
 *    parent is a descendant of the task) — following that link would loop.
 */
export async function cycleGuard(
  env: Env,
  taskId: string,
  proposedParentId: string,
): Promise<"self" | "missing_parent" | "cycle" | null> {
  if (proposedParentId === taskId) return "self";

  const parent = await getIdAndParent(env, proposedParentId);
  if (!parent) return "missing_parent";

  // Walk up from the proposed parent; if we ever reach taskId, linking would
  // close a loop (taskId would become its own ancestor).
  const seen = new Set<string>([proposedParentId]);
  let cursor = parent.parentId;
  for (let depth = 0; cursor && depth < MAX_ANCESTOR_DEPTH; depth++) {
    if (cursor === taskId) return "cycle";
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const next = await getIdAndParent(env, cursor);
    cursor = next?.parentId ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const taskHierarchyRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /{id}/children
// ---------------------------------------------------------------------------

taskHierarchyRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/children",
    tags: ["Task Hierarchy"],
    summary: "List direct child (subtask) tasks",
    operationId: "taskChildrenList",
    request: { params: taskIdParam },
    responses: {
      200: {
        description:
          "Full task rows whose parentId equals this task, ordered by position then createdAt.",
        content: { "application/json": { schema: childrenResponse } },
      },
      404: {
        description: "Parent task not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    if (!(await getIdAndParent(c.env, id))) {
      return c.json({ error: "Task not found." }, 404);
    }
    const db = getDb(c.env);
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.parentId, id))
      .orderBy(asc(tasks.position), asc(tasks.createdAt));
    return c.json({ data: rows }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /{id}/ancestors
// ---------------------------------------------------------------------------

taskHierarchyRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/ancestors",
    tags: ["Task Hierarchy"],
    summary: "Ancestor chain (root → parent) for breadcrumbs",
    operationId: "taskAncestorsList",
    request: { params: taskIdParam },
    responses: {
      200: {
        description:
          "Ordered ancestor chain from root to immediate parent (excludes the task itself). Empty array for a top-level task.",
        content: { "application/json": { schema: ancestorsResponse } },
      },
      404: {
        description: "Task not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const chain = await walkAncestors(c.env, id);
    if (chain === null) return c.json({ error: "Task not found." }, 404);
    return c.json({ data: chain }, 200);
  },
);
