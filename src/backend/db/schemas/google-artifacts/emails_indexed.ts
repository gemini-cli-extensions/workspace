/**
 * @file db/schemas/google/emails_indexed.ts
 * @description Drizzle schema for the `emails_indexed` table.
 * Tracks Gmail messages that have been indexed into the Vectorize index
 * (`VECTORIZE_EMAILS`) so the worker can perform semantic email search
 * without re-fetching or re-embedding already-processed messages.
 * The primary key is the Gmail message id, supplied explicitly.
 */

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Index-tracking table for Gmail messages embedded into Vectorize.
 * `id` is the Gmail messageId — callers must supply it on insert.
 */
export const emailsIndexed = sqliteTable("emails_indexed", {
  /** Gmail message id.  Supplied by the caller; no default. */
  id: text("id").primaryKey(),
  /** Google account ("workspace" | "personal") the message belongs to. */
  account: text("account").notNull(),
  /** Gmail thread id that groups related messages. */
  threadId: text("thread_id").notNull(),
  /** Email subject line. */
  subject: text("subject").notNull(),
  /** Sender address. */
  from: text("from").notNull(),
  /** Primary recipient address(es). */
  to: text("to").notNull(),
  /** Gmail snippet (first ~100 chars of the message body). */
  snippet: text("snippet").notNull(),
  /** Gmail internalDate as a Unix-epoch integer. */
  internalDate: integer("internal_date").notNull(),
  /** JSON array of label ids attached to the message. */
  labelsJson: text("labels_json", { mode: "json" }),
  /**
   * Whether this message has been embedded into the Vectorize index.
   * 1 = vectorized, 0 = pending.
   */
  vectorized: integer("vectorized", { mode: "boolean" }).notNull().default(false),
  /** Unix-epoch timestamp of when the row was created. */
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Zod schema for selecting rows from `emails_indexed`. */
export const selectEmailIndexedSchema = createSelectSchema(emailsIndexed);
/** Zod schema for inserting rows into `emails_indexed`. */
export const insertEmailIndexedSchema = createInsertSchema(emailsIndexed);
