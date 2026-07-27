/**
 * @fileoverview Drizzle schema for the `chat_threads` D1 table.
 *
 * This is the **persistent thread index** for the assistant-ui chat surfaces.
 * It stores per-conversation METADATA (title, selected model, archived flag,
 * timestamps) in D1, while the conversation MESSAGES themselves live server-side
 * in each `ChatBroker` Durable Object's embedded SQLite store.
 *
 * The link between the two is the row `id`: a `chat_threads.id` is ALSO used as
 * the `ChatBroker` DO `name` (`useAgent({ agent: "chat-broker", name: id })`).
 * So one id keys both the metadata (here, in D1) and the message log (in the DO).
 *
 * The frontend's persistent `RemoteThreadListAdapter`
 * (`src/frontend/components/assistant/threadListAdapter.ts`) is backed by the
 * `/api/threads` router, which reads/writes this table.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `chat_threads` table for the docs UI. */
export const CHAT_THREADS_TABLE_DESCRIPTION =
  "Persistent index of assistant-ui chat conversations. Each row's id doubles as the ChatBroker Durable Object name, so a single id keys both this metadata (title, model, archived state) and the conversation's message log (in the DO's embedded SQLite). Backs the persistent RemoteThreadListAdapter via /api/threads.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const CHAT_THREADS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Thread id (UUID). Doubles as the ChatBroker DO `name` so metadata (D1) and messages (DO) stay linked.",
  title: "Short conversation title. Defaults to 'New chat'; auto-generated from the first user turn.",
  model: "Selected Workers AI chat model id for this thread (e.g. @cf/openai/gpt-oss-120b). Null = use the env default.",
  archived: "Boolean (0/1). Archived threads are hidden from the default thread list but not deleted.",
  created_at: "Unix timestamp (seconds) when the thread was created.",
  updated_at: "Unix timestamp (seconds) of the last activity (new message / rename / model change).",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const chatThreads = sqliteTable("chat_threads", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull().default("New chat"),
  model: text("model"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertChatThreadSchema = createInsertSchema(chatThreads);
export const selectChatThreadSchema = createSelectSchema(chatThreads);
export type ChatThread = typeof chatThreads.$inferSelect;
export type NewChatThread = typeof chatThreads.$inferInsert;
