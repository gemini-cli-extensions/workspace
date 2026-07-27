/**
 * @file db/schemas/google/documents.ts
 * @description Drizzle schema for the `google_documents` table.
 * Caches metadata for Google Docs that have been accessed or created
 * by the worker.  The primary key is the Google document id (docId),
 * supplied explicitly — not auto-generated.
 */

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Metadata cache for Google Docs artifacts.
 * `id` is the Google docId — callers must supply it on insert.
 */
export const googleDocuments = sqliteTable("google_documents", {
  /** Google document id (docId).  Supplied by the caller; no default. */
  id: text("id").primaryKey(),
  /** Google account ("workspace" | "personal") that owns this doc. */
  account: text("account").notNull(),
  /** Human-readable document title. */
  name: text("name").notNull(),
  /** Canonical Google Docs URL for the document. */
  url: text("url").notNull(),
  /** Drive folder id of the parent folder, if known. */
  folderId: text("folder_id"),
  /** Email address of the user or service account that created the doc. */
  createdBy: text("created_by").notNull(),
  /** Unix-epoch timestamp of when the doc was first indexed. */
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  /** Unix-epoch timestamp of the last known modification. */
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Zod schema for selecting rows from `google_documents`. */
export const selectGoogleDocumentSchema = createSelectSchema(googleDocuments);
/** Zod schema for inserting rows into `google_documents`. */
export const insertGoogleDocumentSchema = createInsertSchema(googleDocuments);
