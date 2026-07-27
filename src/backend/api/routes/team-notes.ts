/**
 * @fileoverview Team Notes REST API router.
 *
 * Full CRUD over the `team_notes` D1 table with optional project scoping and
 * pinning support.
 *
 * Mount this router at `/api/team-notes` in `api/index.ts`.
 *
 * Route inventory:
 *   GET    /        – list notes (q, projectId, pinned, limit, offset)
 *   POST   /        – create note
 *   GET    /{id}    – get note by id
 *   PATCH  /{id}    – partial update
 *   DELETE /{id}    – hard delete
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq, like, or, sql } from "drizzle-orm";

import { getDb } from "../../db";
import { insertTeamNoteSchema, selectTeamNoteSchema, teamNotes } from "../../db/schema";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const noteIdParam = z.object({ id: z.string().min(1) });
const notFoundSchema = z.object({ error: z.string() });

const noteListQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .openapi({ description: "Full-text search on title and body." }),
  projectId: z
    .string()
    .optional()
    .openapi({ description: "Filter to notes belonging to this project." }),
  pinned: z
    .enum(["true", "false"])
    .optional()
    .openapi({ description: "Filter to pinned (true) or un-pinned (false) notes." }),
  limit: z.string().optional().openapi({ description: "Max rows (default 50)." }),
  offset: z.string().optional().openapi({ description: "Skip rows for pagination (default 0)." }),
});

/** Slim insert body — server generates id, createdAt, updatedAt. */
const createNoteBody = insertTeamNoteSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ title: z.string().min(1), body: z.string().min(1) });

/** All fields optional for PATCH. */
const patchNoteBody = createNoteBody.partial();

const noteListResponse = z.object({
  data: z.array(selectTeamNoteSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

const deleteResponseSchema = z.object({ ok: z.boolean() });

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const teamNotesRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

teamNotesRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["TeamNotes"],
    summary: "List team notes",
    operationId: "teamNotesList",
    request: { query: noteListQuerySchema },
    responses: {
      200: {
        description: "Paginated list of team notes.",
        content: { "application/json": { schema: noteListResponse } },
      },
    },
  }),
  async (c) => {
    const { q, projectId, pinned, limit: lStr, offset: oStr } = c.req.valid("query");
    const limit = Math.min(parseInt(lStr ?? "50", 10) || 50, 200);
    const offset = parseInt(oStr ?? "0", 10) || 0;
    const db = getDb(c.env);

    const conditions = [];
    if (q) {
      conditions.push(or(like(teamNotes.title, `%${q}%`), like(teamNotes.body, `%${q}%`)));
    }
    if (projectId) conditions.push(eq(teamNotes.projectId, projectId));
    if (pinned !== undefined) conditions.push(eq(teamNotes.pinned, pinned === "true"));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(teamNotes)
        .where(where)
        .orderBy(desc(teamNotes.pinned), desc(teamNotes.updatedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(teamNotes).where(where),
    ]);

    return c.json({ data: rows, total: countResult[0]?.count ?? 0, limit, offset }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

teamNotesRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["TeamNotes"],
    summary: "Create team note",
    operationId: "teamNotesCreate",
    request: {
      body: { content: { "application/json": { schema: createNoteBody } } },
    },
    responses: {
      201: {
        description: "Created team note.",
        content: { "application/json": { schema: selectTeamNoteSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const [row] = await db
      .insert(teamNotes)
      .values({ ...body, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return c.json(row!, 201);
  },
);

// ---------------------------------------------------------------------------
// GET /{id}
// ---------------------------------------------------------------------------

teamNotesRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    tags: ["TeamNotes"],
    summary: "Get team note by ID",
    operationId: "teamNotesGet",
    request: { params: noteIdParam },
    responses: {
      200: {
        description: "Team note record.",
        content: { "application/json": { schema: selectTeamNoteSchema } },
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
    const [row] = await db.select().from(teamNotes).where(eq(teamNotes.id, id)).limit(1);
    if (!row) {
      return c.json({ error: "Note not found." }, 404);
    }
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// PATCH /{id}
// ---------------------------------------------------------------------------

teamNotesRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["TeamNotes"],
    summary: "Partial update team note",
    operationId: "teamNotesPatch",
    request: {
      params: noteIdParam,
      body: { content: { "application/json": { schema: patchNoteBody } } },
    },
    responses: {
      200: {
        description: "Updated team note.",
        content: { "application/json": { schema: selectTeamNoteSchema } },
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
      .update(teamNotes)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(teamNotes.id, id))
      .returning();
    if (!row) {
      return c.json({ error: "Note not found." }, 404);
    }
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// DELETE /{id}
// ---------------------------------------------------------------------------

teamNotesRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["TeamNotes"],
    summary: "Delete team note",
    operationId: "teamNotesDelete",
    request: { params: noteIdParam },
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
      .delete(teamNotes)
      .where(eq(teamNotes.id, id))
      .returning({ id: teamNotes.id });
    if (result.length === 0) {
      return c.json({ error: "Note not found." }, 404);
    }
    return c.json({ ok: true }, 200);
  },
);
