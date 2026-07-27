/**
 * @file db/schemas/ai/threads.ts
 * @description Drizzle schema for the `threads` table.
 * Represents a chat conversation thread.  A thread groups an ordered sequence
 * of messages exchanged between a user and one of the specialist agents.
 * Threads are scoped to a session key (not a hard FK so sessions can be
 * rotated without cascading deletes into conversation history).
 */

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Chat thread container.  Each row represents a single conversation context.
 * Threads may be linked to a task row via the `taskId` column (optional).
 */
export const threads = sqliteTable("threads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /**
   * Opaque, unguessable thread key (uuid). Used as the Cloudflare Agents DO
   * instance name (`/agents/orchestrator-agent/<key>`) so the integer PK is
   * never exposed as a routable identifier. Unique across all threads.
   *
   * Nullable so the migration can be applied to a table with existing rows
   * (SQLite cannot add a NOT NULL column without a default, and a constant
   * backfill would violate UNIQUE). New threads always mint a key; legacy
   * pre-mirror rows simply aren't addressable by the DO-name scheme. SQLite
   * treats NULLs as distinct under the unique index, so multiple legacy NULLs
   * coexist.
   */
  key: text("key").unique(),
  // Session-owned records stay grouped by the authenticated session key without a direct FK
  // so content is not cascade-deleted when short-lived sessions are revoked or rotated.
  sessionKey: text("session_key").notNull(),
  title: text("title").notNull(),
  /**
   * Durable Object agent name handling this thread (e.g. "DocsAgent",
   * "OrchestratorAgent").  Null for legacy threads created before agents were added.
   */
  agent: text("agent"),
  /**
   * Google account context used in this thread: "workspace" | "personal".
   * Null for threads that predate the multi-account model.
   */
  account: text("account"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Zod schema for selecting rows from `threads`. */
export const selectThreadSchema = createSelectSchema(threads);
/** Zod schema for inserting rows into `threads`. */
export const insertThreadSchema = createInsertSchema(threads);
