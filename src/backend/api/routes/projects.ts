/**
 * @fileoverview Projects REST API router.
 *
 * Provides full CRUD over the `projects` D1 table plus a star-toggle action.
 * All routes are registered via `app.openapi(createRoute(...), handler)` so
 * every endpoint is reflected in `/openapi.json` and Scalar/Swagger UI.
 *
 * Mount this router at `/api/projects` in `api/index.ts`.
 *
 * Route inventory:
 *   GET    /           – list projects (q, status, starred, sort, limit, offset)
 *   POST   /           – create project
 *   GET    /{id}       – get project by id
 *   PATCH  /{id}       – partial update
 *   DELETE /{id}       – hard delete
 *   POST   /{id}/star  – toggle starred flag
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq, like, or, sql } from "drizzle-orm";

import { getDb } from "../../db";
import { insertProjectSchema, projects, selectProjectSchema } from "../../db/schema";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const projectIdParam = z.object({ id: z.string().min(1) });

const projectListQuerySchema = z.object({
  q: z.string().optional().openapi({ description: "Full-text search on name and description." }),
  status: z
    .enum(["active", "archived", "on_hold"])
    .optional()
    .openapi({ description: "Filter by lifecycle status." }),
  starred: z
    .enum(["true", "false"])
    .optional()
    .openapi({ description: "Filter to starred (true) or un-starred (false) projects." }),
  sort: z
    .enum(["name", "createdAt", "updatedAt", "taskCount"])
    .optional()
    .openapi({ description: "Sort field (default: updatedAt desc)." }),
  limit: z
    .string()
    .optional()
    .openapi({ description: "Max rows to return (default 50)." }),
  offset: z
    .string()
    .optional()
    .openapi({ description: "Rows to skip for pagination (default 0)." }),
});

/** Slim insert body — id, createdAt, updatedAt are server-generated. */
const createProjectBody = insertProjectSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ name: z.string().min(1), slug: z.string().min(1) });

/** All project fields are optional for a PATCH. */
const patchProjectBody = createProjectBody.partial();

const projectListResponse = z.object({
  data: z.array(selectProjectSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

const deleteResponseSchema = z.object({ ok: z.boolean() });
const starResponseSchema = z.object({ id: z.string(), starred: z.boolean() });

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const projectsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

projectsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Projects"],
    summary: "List projects",
    operationId: "projectsList",
    request: { query: projectListQuerySchema },
    responses: {
      200: {
        description: "Paginated list of projects.",
        content: { "application/json": { schema: projectListResponse } },
      },
    },
  }),
  async (c) => {
    const { q, status, starred, sort, limit: lStr, offset: oStr } = c.req.valid("query");
    const limit = Math.min(parseInt(lStr ?? "50", 10) || 50, 200);
    const offset = parseInt(oStr ?? "0", 10) || 0;
    const db = getDb(c.env);

    const conditions = [];
    if (q) {
      conditions.push(
        or(like(projects.name, `%${q}%`), like(projects.description, `%${q}%`)),
      );
    }
    if (status) conditions.push(eq(projects.status, status));
    if (starred !== undefined) {
      conditions.push(eq(projects.starred, starred === "true"));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortMap = {
      name: projects.name,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      taskCount: projects.taskCount,
    } as const;
    const sortCol = sortMap[sort as keyof typeof sortMap] ?? projects.updatedAt;

    const [rows, countResult] = await Promise.all([
      db.select().from(projects).where(where).orderBy(desc(sortCol)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(projects).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return c.json({ data: rows, total, limit, offset }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

projectsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Projects"],
    summary: "Create project",
    operationId: "projectsCreate",
    request: {
      body: { content: { "application/json": { schema: createProjectBody } } },
    },
    responses: {
      201: {
        description: "Created project.",
        content: { "application/json": { schema: selectProjectSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const [row] = await db
      .insert(projects)
      .values({ ...body, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return c.json(row!, 201);
  },
);

// ---------------------------------------------------------------------------
// GET /{id}
// ---------------------------------------------------------------------------

const notFoundSchema = z.object({ error: z.string() });

projectsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Projects"],
    summary: "Get project by ID",
    operationId: "projectsGet",
    request: { params: projectIdParam },
    responses: {
      200: {
        description: "Project record.",
        content: { "application/json": { schema: selectProjectSchema } },
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
    const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!row) {
      return c.json({ error: "Project not found." }, 404);
    }
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// PATCH /{id}
// ---------------------------------------------------------------------------

projectsRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["Projects"],
    summary: "Partial update project",
    operationId: "projectsPatch",
    request: {
      params: projectIdParam,
      body: { content: { "application/json": { schema: patchProjectBody } } },
    },
    responses: {
      200: {
        description: "Updated project.",
        content: { "application/json": { schema: selectProjectSchema } },
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
      .update(projects)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    if (!row) {
      return c.json({ error: "Project not found." }, 404);
    }
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// DELETE /{id}
// ---------------------------------------------------------------------------

projectsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Projects"],
    summary: "Delete project",
    operationId: "projectsDelete",
    request: { params: projectIdParam },
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
      .delete(projects)
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    if (result.length === 0) {
      return c.json({ error: "Project not found." }, 404);
    }
    return c.json({ ok: true }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /{id}/star  — toggle starred flag
// ---------------------------------------------------------------------------

projectsRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/star",
    tags: ["Projects"],
    summary: "Toggle project starred flag",
    operationId: "projectsToggleStar",
    request: { params: projectIdParam },
    responses: {
      200: {
        description: "New starred state.",
        content: { "application/json": { schema: starResponseSchema } },
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
    // Read current value then flip
    const [current] = await db
      .select({ starred: projects.starred })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!current) {
      return c.json({ error: "Project not found." }, 404);
    }
    const [updated] = await db
      .update(projects)
      .set({ starred: !current.starred, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning({ id: projects.id, starred: projects.starred });
    return c.json(updated!, 200);
  },
);
