/**
 * @file db/schemas/ai/messages.ts
 * @description Drizzle schema for the `messages` table.
 * Stores individual chat messages within a thread.  The `role` column
 * follows the AI SDK / OpenAI convention.  `agent` and `account` are
 * carried per-message so a single thread can fan across multiple agents
 * or account contexts without losing attribution.
 */

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { threads } from "./threads";

/**
 * Individual messages within a chat thread.
 * Ordered by `created_at ASC` to reconstruct the conversation.
 */
export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    threadId: integer("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    /**
     * The originating `UIMessage.id` from the Durable Object's chat history.
     * Stored so the D1 mirror can upsert idempotently (one row per DO message)
     * and so reconnects/replays never create duplicates. Null only for legacy
     * rows written before D1 mirroring existed.
     */
    messageId: text("message_id"),
    /** Message author role per AI SDK / OpenAI spec. */
    role: text("role", {
      enum: ["user", "assistant", "system", "tool"],
    }).notNull(),
    /** Full text (or structured JSON string) content of the message. */
    content: text("content").notNull(),
    /**
     * Durable Object agent name that generated this message, if applicable.
     * Null for user messages or legacy rows.
     */
    agent: text("agent"),
    /**
     * Google account context at the time this message was generated.
     * "workspace" | "personal" | null for user messages.
     */
    account: text("account"),
    /** Legacy plain-text metadata field (kept for backward compatibility). */
    metadata: text("metadata"),
    /** Structured JSON metadata (tool call args, partial results, annotations). */
    metadataJson: text("metadata_json", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    // Idempotent D1 mirroring: one row per (thread, DO message id).
    uniqueIndex("messages_thread_message_idx").on(table.threadId, table.messageId),
  ],
);

/** Zod schema for selecting rows from `messages`. */
export const selectMessageSchema = createSelectSchema(messages);
/** Zod schema for inserting rows into `messages`. */
export const insertMessageSchema = createInsertSchema(messages);
