/**
 * @fileoverview Chat threads REST API router.
 *
 * The persistent thread index for the assistant-ui chat surfaces. Backs the
 * frontend's `RemoteThreadListAdapter` (list / create / rename / archive /
 * delete) and the dynamic follow-up suggestions endpoint.
 *
 * A thread row's `id` doubles as the `ChatBroker` Durable Object `name`, so the
 * metadata here (D1) and the messages (DO embedded SQLite) stay linked by one id.
 *
 * Mount this router at `/api/threads` in `api/index.ts`.
 *
 * Route inventory:
 *   GET    /                – list non-archived threads, newest activity first
 *   POST   /                – create a thread → { id, ... }
 *   GET    /{id}            – get one thread
 *   PATCH  /{id}            – partial update (title / model / archived)
 *   DELETE /{id}            – hard delete
 *   POST   /followups       – generate 3 follow-up prompts from recent messages
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";
import { generateText } from "ai";

import { getDb } from "../../db";
import {
  chatThreads,
  insertChatThreadSchema,
  selectChatThreadSchema,
} from "../../db/schema";
import { getChatModel } from "../../ai/providers/ai-sdk";
import { asChatModelId } from "../../ai/models/chat-models";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const threadIdParam = z.object({ id: z.string().min(1) });
const notFoundSchema = z.object({ error: z.string() });

/** Slim create body — every field optional; server generates id + timestamps. */
const createThreadBody = insertChatThreadSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial()
  .openapi("CreateThreadBody");

/** PATCH body — title / model / archived. */
const patchThreadBody = z
  .object({
    title: z.string().min(1).optional(),
    model: z.string().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .openapi("PatchThreadBody");

const threadListResponse = z.object({ data: z.array(selectChatThreadSchema) });
const deleteResponseSchema = z.object({ ok: z.boolean() });

// ---------------------------------------------------------------------------
// Followups schemas
// ---------------------------------------------------------------------------

const followupMessage = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const followupsBody = z
  .object({
    /** Thread id (used to resolve the thread's selected model). */
    threadId: z.string().optional(),
    /** Recent conversation turns (most-recent last). */
    messages: z.array(followupMessage).min(1),
  })
  .openapi("FollowupsBody");

const followupsResponse = z.object({ suggestions: z.array(z.string()) });

const titleBody = z
  .object({
    /** Recent conversation turns used to derive the title (most-recent last). */
    messages: z.array(followupMessage).min(1),
  })
  .openapi("TitleBody");

const titleResponse = z.object({ title: z.string() });

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const threadsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET / — list non-archived threads
// ---------------------------------------------------------------------------

threadsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Chat Threads"],
    summary: "List chat threads",
    operationId: "threadsList",
    responses: {
      200: {
        description: "Non-archived threads, newest activity first.",
        content: { "application/json": { schema: threadListResponse } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const rows = await db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.archived, false))
      .orderBy(desc(chatThreads.updatedAt));
    return c.json({ data: rows }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST / — create a thread
// ---------------------------------------------------------------------------

threadsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Chat Threads"],
    summary: "Create a chat thread",
    operationId: "threadsCreate",
    request: {
      body: { content: { "application/json": { schema: createThreadBody } } },
    },
    responses: {
      201: {
        description: "Created thread.",
        content: { "application/json": { schema: selectChatThreadSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const now = new Date();
    const [row] = await db
      .insert(chatThreads)
      .values({
        title: body.title ?? "New chat",
        model: asChatModelId(body.model) ?? null,
        archived: body.archived ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return c.json(row!, 201);
  },
);

// ---------------------------------------------------------------------------
// POST /followups — dynamic follow-up suggestions
// ---------------------------------------------------------------------------
//
// Declared BEFORE GET /{id} so "/followups" is not swallowed by the id param.

threadsRouter.openapi(
  createRoute({
    method: "post",
    path: "/followups",
    tags: ["Chat Threads"],
    summary: "Generate 3 short follow-up prompts from recent messages",
    operationId: "threadsFollowups",
    request: {
      body: { content: { "application/json": { schema: followupsBody } } },
    },
    responses: {
      200: {
        description: "Up to 3 suggested next prompts (may be empty on failure).",
        content: { "application/json": { schema: followupsResponse } },
      },
    },
  }),
  async (c) => {
    const { threadId, messages } = c.req.valid("json");
    const db = getDb(c.env);

    // Resolve the thread's selected model so followups match the chat model.
    let modelId: string | null = null;
    if (threadId) {
      const [row] = await db
        .select({ model: chatThreads.model })
        .from(chatThreads)
        .where(eq(chatThreads.id, threadId))
        .limit(1);
      modelId = row?.model ?? null;
    }

    // Keep the prompt tight: last ~6 turns is plenty of context.
    const transcript = messages
      .slice(-6)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    try {
      const { text } = await generateText({
        model: getChatModel(c.env, modelId),
        system:
          "You generate short follow-up prompts the USER might tap next in a chat. " +
          "Return EXACTLY 3 suggestions, each on its own line, no numbering, no quotes, " +
          "no preamble. Each must be under 8 words and phrased as the user speaking.",
        prompt: `Conversation so far:\n${transcript}\n\nThree follow-up prompts:`,
      });

      const suggestions = text
        .split("\n")
        .map((line) => line.replace(/^[\s\-*\d.)"]+/, "").replace(/["]+$/, "").trim())
        .filter((line) => line.length > 0 && line.length <= 80)
        .slice(0, 3);

      return c.json({ suggestions }, 200);
    } catch (error) {
      // Followups are best-effort: never fail the chat over a degraded model.
      console.error("threads followups error:", error);
      return c.json({ suggestions: [] }, 200);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /{id}/title — generate + persist a short title from recent messages
// ---------------------------------------------------------------------------
//
// Declared before GET /{id} is irrelevant here (distinct path), but kept with
// the followups family. Used by the frontend adapter's `generateTitle`.

threadsRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/title",
    tags: ["Chat Threads"],
    summary: "Generate and persist a short title for a thread",
    operationId: "threadsGenerateTitle",
    request: {
      params: threadIdParam,
      body: { content: { "application/json": { schema: titleBody } } },
    },
    responses: {
      200: {
        description: "The generated (and persisted) title.",
        content: { "application/json": { schema: titleResponse } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { messages } = c.req.valid("json");
    const db = getDb(c.env);

    const [row] = await db
      .select({ model: chatThreads.model })
      .from(chatThreads)
      .where(eq(chatThreads.id, id))
      .limit(1);
    if (!row) return c.json({ error: "Thread not found." }, 404);

    const firstUser = messages.find((m) => m.role === "user")?.content ?? messages[0]!.content;

    let title = "New chat";
    try {
      const { text } = await generateText({
        model: getChatModel(c.env, row.model),
        system:
          "You write a short chat title (3-7 words) summarising the user's message. " +
          "Return ONLY the title — no quotes, no trailing punctuation, no preamble.",
        prompt: firstUser.slice(0, 800),
      });
      title = text.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 80) || "New chat";
    } catch (error) {
      console.error("threads title error:", error);
    }

    await db
      .update(chatThreads)
      .set({ title, updatedAt: new Date() })
      .where(eq(chatThreads.id, id));

    return c.json({ title }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /{id} — get one thread
// ---------------------------------------------------------------------------

threadsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Chat Threads"],
    summary: "Get a chat thread by id",
    operationId: "threadsGet",
    request: { params: threadIdParam },
    responses: {
      200: {
        description: "Thread record.",
        content: { "application/json": { schema: selectChatThreadSchema } },
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
    const [row] = await db.select().from(chatThreads).where(eq(chatThreads.id, id)).limit(1);
    if (!row) return c.json({ error: "Thread not found." }, 404);
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// PATCH /{id} — partial update
// ---------------------------------------------------------------------------

threadsRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["Chat Threads"],
    summary: "Update a chat thread (title / model / archived)",
    operationId: "threadsPatch",
    request: {
      params: threadIdParam,
      body: { content: { "application/json": { schema: patchThreadBody } } },
    },
    responses: {
      200: {
        description: "Updated thread.",
        content: { "application/json": { schema: selectChatThreadSchema } },
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

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) patch.title = body.title;
    if (body.archived !== undefined) patch.archived = body.archived;
    // Model is validated against the offered set; an unknown id clears it.
    if (body.model !== undefined) patch.model = asChatModelId(body.model) ?? null;

    const [row] = await db
      .update(chatThreads)
      .set(patch)
      .where(eq(chatThreads.id, id))
      .returning();
    if (!row) return c.json({ error: "Thread not found." }, 404);
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// DELETE /{id} — hard delete
// ---------------------------------------------------------------------------

threadsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Chat Threads"],
    summary: "Delete a chat thread",
    operationId: "threadsDelete",
    request: { params: threadIdParam },
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
      .delete(chatThreads)
      .where(eq(chatThreads.id, id))
      .returning({ id: chatThreads.id });
    if (result.length === 0) return c.json({ error: "Thread not found." }, 404);
    return c.json({ ok: true }, 200);
  },
);
