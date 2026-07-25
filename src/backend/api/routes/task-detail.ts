/**
 * @fileoverview Task-detail sub-router — the Comments, Subtasks, and Attachments
 * surfaces for a single task, mounted alongside {@link tasksRouter} under
 * `/api/tasks`.
 *
 * Split out of `tasks.ts` to keep both files under the 400-line cap. Every route
 * here is scoped to a `{id}` task path segment:
 *
 *   Comments
 *     GET    /{id}/comments                  – list, oldest→newest
 *     POST   /{id}/comments                  – append a comment
 *
 *   Subtasks
 *     GET    /{id}/subtasks                  – list, by position then createdAt
 *     POST   /{id}/subtasks                  – add a subtask
 *     PATCH  /{id}/subtasks/{subId}          – toggle done / rename
 *     DELETE /{id}/subtasks/{subId}          – remove a subtask
 *
 *   Attachments
 *     GET    /{id}/attachments               – list metadata
 *     POST   /{id}/attachments               – upload (multipart) → R2 + row
 *     GET    /{id}/attachments/{attId}       – stream bytes from R2
 *     DELETE /{id}/attachments/{attId}       – delete R2 object + row
 *
 * Subtask toggles additionally re-derive and PATCH the parent task's `progress`
 * so the board / table stay in sync. Attachment bytes live in the
 * `R2_FILES_BUCKET` binding at `tasks/{taskId}/{uuid}-{filename}`; this router
 * only persists pointer metadata in D1.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, eq } from "drizzle-orm";

import { getDb } from "../../db";
import {
  selectTaskAttachmentSchema,
  selectTaskCommentSchema,
  selectTaskSubtaskSchema,
  taskAttachments,
  taskComments,
  taskSubtasks,
  tasks,
} from "../../db/schema";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const taskIdParam = z.object({ id: z.string().min(1) });
const notFoundSchema = z.object({ error: z.string() });
const deleteResponseSchema = z.object({ ok: z.boolean() });

/** Ensure a task exists before touching its children; returns true if present. */
async function taskExists(env: Env, id: string): Promise<boolean> {
  const db = getDb(env);
  const [row] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).limit(1);
  return Boolean(row);
}

export const taskDetailRouter = new OpenAPIHono<{ Bindings: Env }>();

// ===========================================================================
// Comments
// ===========================================================================

const commentListResponse = z.object({ data: z.array(selectTaskCommentSchema) });
const createCommentBody = z.object({
  body: z.string().min(1).openapi({ description: "Comment text." }),
  author: z.string().min(1).optional().openapi({ description: "Author display name (default 'You')." }),
});

taskDetailRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/comments",
    tags: ["Task Detail"],
    summary: "List comments for a task (oldest → newest)",
    operationId: "taskCommentsList",
    request: { params: taskIdParam },
    responses: {
      200: {
        description: "Comments in chronological order.",
        content: { "application/json": { schema: commentListResponse } },
      },
      404: { description: "Task not found.", content: { "application/json": { schema: notFoundSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    if (!(await taskExists(c.env, id))) return c.json({ error: "Task not found." }, 404);
    const db = getDb(c.env);
    const rows = await db
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, id))
      .orderBy(asc(taskComments.createdAt));
    return c.json({ data: rows }, 200);
  },
);

taskDetailRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/comments",
    tags: ["Task Detail"],
    summary: "Add a comment to a task",
    operationId: "taskCommentsCreate",
    request: {
      params: taskIdParam,
      body: { content: { "application/json": { schema: createCommentBody } } },
    },
    responses: {
      201: { description: "Created comment.", content: { "application/json": { schema: selectTaskCommentSchema } } },
      404: { description: "Task not found.", content: { "application/json": { schema: notFoundSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    if (!(await taskExists(c.env, id))) return c.json({ error: "Task not found." }, 404);
    const db = getDb(c.env);
    const [row] = await db
      .insert(taskComments)
      .values({ taskId: id, body: body.body, author: body.author ?? "You", createdAt: new Date() })
      .returning();
    return c.json(row!, 201);
  },
);

// ===========================================================================
// Subtasks
// ===========================================================================

const subtaskIdParam = z.object({ id: z.string().min(1), subId: z.string().min(1) });
const subtaskListResponse = z.object({ data: z.array(selectTaskSubtaskSchema) });
const createSubtaskBody = z.object({
  title: z.string().min(1).openapi({ description: "Checklist item label." }),
});
const patchSubtaskBody = z
  .object({
    title: z.string().min(1).optional().openapi({ description: "Rename the subtask." }),
    done: z.boolean().optional().openapi({ description: "Toggle completion." }),
  })
  .refine((v) => v.title !== undefined || v.done !== undefined, {
    message: "Provide at least one of `title` or `done`.",
  });

/**
 * Re-derive the parent task's `progress` from its subtasks and PATCH it, so the
 * board / table progress stays in sync. Called after any subtask mutation. When
 * there are no subtasks the task progress is left untouched.
 */
async function syncTaskProgress(env: Env, taskId: string): Promise<void> {
  const db = getDb(env);
  const rows = await db
    .select({ done: taskSubtasks.done })
    .from(taskSubtasks)
    .where(eq(taskSubtasks.taskId, taskId));
  if (rows.length === 0) return;
  const done = rows.filter((r) => r.done).length;
  const progress = Math.round((done / rows.length) * 100);
  await db.update(tasks).set({ progress, updatedAt: new Date() }).where(eq(tasks.id, taskId));
}

taskDetailRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/subtasks",
    tags: ["Task Detail"],
    summary: "List subtasks for a task",
    operationId: "taskSubtasksList",
    request: { params: taskIdParam },
    responses: {
      200: { description: "Subtasks ordered by position.", content: { "application/json": { schema: subtaskListResponse } } },
      404: { description: "Task not found.", content: { "application/json": { schema: notFoundSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    if (!(await taskExists(c.env, id))) return c.json({ error: "Task not found." }, 404);
    const db = getDb(c.env);
    const rows = await db
      .select()
      .from(taskSubtasks)
      .where(eq(taskSubtasks.taskId, id))
      .orderBy(asc(taskSubtasks.position), asc(taskSubtasks.createdAt));
    return c.json({ data: rows }, 200);
  },
);

taskDetailRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/subtasks",
    tags: ["Task Detail"],
    summary: "Add a subtask",
    operationId: "taskSubtasksCreate",
    request: {
      params: taskIdParam,
      body: { content: { "application/json": { schema: createSubtaskBody } } },
    },
    responses: {
      201: { description: "Created subtask.", content: { "application/json": { schema: selectTaskSubtaskSchema } } },
      404: { description: "Task not found.", content: { "application/json": { schema: notFoundSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { title } = c.req.valid("json");
    if (!(await taskExists(c.env, id))) return c.json({ error: "Task not found." }, 404);
    const db = getDb(c.env);
    // Append to the end of the checklist.
    const existing = await db
      .select({ position: taskSubtasks.position })
      .from(taskSubtasks)
      .where(eq(taskSubtasks.taskId, id));
    const nextPosition = existing.reduce((max, r) => Math.max(max, r.position), -1) + 1;
    const [row] = await db
      .insert(taskSubtasks)
      .values({ taskId: id, title, position: nextPosition, createdAt: new Date() })
      .returning();
    await syncTaskProgress(c.env, id);
    return c.json(row!, 201);
  },
);

taskDetailRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}/subtasks/{subId}",
    tags: ["Task Detail"],
    summary: "Toggle done or rename a subtask (re-syncs task progress)",
    operationId: "taskSubtasksPatch",
    request: {
      params: subtaskIdParam,
      body: { content: { "application/json": { schema: patchSubtaskBody } } },
    },
    responses: {
      200: { description: "Updated subtask.", content: { "application/json": { schema: selectTaskSubtaskSchema } } },
      404: { description: "Subtask not found.", content: { "application/json": { schema: notFoundSchema } } },
    },
  }),
  async (c) => {
    const { id, subId } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const patch: { title?: string; done?: boolean } = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.done !== undefined) patch.done = body.done;
    const [row] = await db
      .update(taskSubtasks)
      .set(patch)
      .where(and(eq(taskSubtasks.id, subId), eq(taskSubtasks.taskId, id)))
      .returning();
    if (!row) return c.json({ error: "Subtask not found." }, 404);
    await syncTaskProgress(c.env, id);
    return c.json(row, 200);
  },
);

taskDetailRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}/subtasks/{subId}",
    tags: ["Task Detail"],
    summary: "Delete a subtask (re-syncs task progress)",
    operationId: "taskSubtasksDelete",
    request: { params: subtaskIdParam },
    responses: {
      200: { description: "Deletion confirmation.", content: { "application/json": { schema: deleteResponseSchema } } },
      404: { description: "Subtask not found.", content: { "application/json": { schema: notFoundSchema } } },
    },
  }),
  async (c) => {
    const { id, subId } = c.req.valid("param");
    const db = getDb(c.env);
    const result = await db
      .delete(taskSubtasks)
      .where(and(eq(taskSubtasks.id, subId), eq(taskSubtasks.taskId, id)))
      .returning({ id: taskSubtasks.id });
    if (result.length === 0) return c.json({ error: "Subtask not found." }, 404);
    await syncTaskProgress(c.env, id);
    return c.json({ ok: true }, 200);
  },
);

// ===========================================================================
// Attachments
// ===========================================================================

const attachmentIdParam = z.object({ id: z.string().min(1), attId: z.string().min(1) });
const attachmentListResponse = z.object({ data: z.array(selectTaskAttachmentSchema) });

/** Multipart upload body — the browser sends a `file` form field. */
const uploadBody = z.object({
  file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
});

taskDetailRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/attachments",
    tags: ["Task Detail"],
    summary: "List attachment metadata for a task",
    operationId: "taskAttachmentsList",
    request: { params: taskIdParam },
    responses: {
      200: { description: "Attachment metadata rows.", content: { "application/json": { schema: attachmentListResponse } } },
      404: { description: "Task not found.", content: { "application/json": { schema: notFoundSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    if (!(await taskExists(c.env, id))) return c.json({ error: "Task not found." }, 404);
    const db = getDb(c.env);
    const rows = await db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, id))
      .orderBy(asc(taskAttachments.createdAt));
    return c.json({ data: rows }, 200);
  },
);

taskDetailRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/attachments",
    tags: ["Task Detail"],
    summary: "Upload a file attachment (multipart) → R2 + metadata row",
    operationId: "taskAttachmentsCreate",
    request: {
      params: taskIdParam,
      body: { content: { "multipart/form-data": { schema: uploadBody } } },
    },
    responses: {
      201: { description: "Created attachment metadata.", content: { "application/json": { schema: selectTaskAttachmentSchema } } },
      400: { description: "No file supplied.", content: { "application/json": { schema: notFoundSchema } } },
      404: { description: "Task not found.", content: { "application/json": { schema: notFoundSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    if (!(await taskExists(c.env, id))) return c.json({ error: "Task not found." }, 404);

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return c.json({ error: "No file supplied." }, 400);
    }

    const filename = file.name || "file";
    const r2Key = `tasks/${id}/${crypto.randomUUID()}-${filename}`;
    const contentType = file.type || "application/octet-stream";

    // Stream the bytes into R2, then persist the pointer metadata in D1.
    await c.env.R2_FILES_BUCKET.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType },
    });

    const db = getDb(c.env);
    const [row] = await db
      .insert(taskAttachments)
      .values({
        taskId: id,
        filename,
        size: file.size,
        contentType,
        r2Key,
        createdAt: new Date(),
      })
      .returning();
    return c.json(row!, 201);
  },
);

taskDetailRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/attachments/{attId}",
    tags: ["Task Detail"],
    summary: "Stream an attachment's bytes from R2 (view / download)",
    operationId: "taskAttachmentsStream",
    request: { params: attachmentIdParam },
    responses: {
      200: { description: "The file bytes with their stored content type." },
      404: { description: "Attachment not found.", content: { "application/json": { schema: notFoundSchema } } },
    },
  }),
  async (c) => {
    const { id, attId } = c.req.valid("param");
    const db = getDb(c.env);
    const [row] = await db
      .select()
      .from(taskAttachments)
      .where(and(eq(taskAttachments.id, attId), eq(taskAttachments.taskId, id)))
      .limit(1);
    if (!row) return c.json({ error: "Attachment not found." }, 404);

    const object = await c.env.R2_FILES_BUCKET.get(row.r2Key);
    if (!object) return c.json({ error: "Attachment not found." }, 404);

    const headers = new Headers();
    headers.set("Content-Type", row.contentType ?? "application/octet-stream");
    if (row.size != null) headers.set("Content-Length", String(row.size));
    headers.set(
      "Content-Disposition",
      `inline; filename="${row.filename.replace(/"/g, "")}"`,
    );
    return new Response(object.body, { status: 200, headers });
  },
);

taskDetailRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}/attachments/{attId}",
    tags: ["Task Detail"],
    summary: "Delete an attachment (R2 object + metadata row)",
    operationId: "taskAttachmentsDelete",
    request: { params: attachmentIdParam },
    responses: {
      200: { description: "Deletion confirmation.", content: { "application/json": { schema: deleteResponseSchema } } },
      404: { description: "Attachment not found.", content: { "application/json": { schema: notFoundSchema } } },
    },
  }),
  async (c) => {
    const { id, attId } = c.req.valid("param");
    const db = getDb(c.env);
    const [row] = await db
      .select()
      .from(taskAttachments)
      .where(and(eq(taskAttachments.id, attId), eq(taskAttachments.taskId, id)))
      .limit(1);
    if (!row) return c.json({ error: "Attachment not found." }, 404);

    await c.env.R2_FILES_BUCKET.delete(row.r2Key);
    await db.delete(taskAttachments).where(eq(taskAttachments.id, attId));
    return c.json({ ok: true }, 200);
  },
);
