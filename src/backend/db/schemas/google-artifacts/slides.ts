/**
 * @file db/schemas/google/slides.ts
 * @description Drizzle schema for the `google_slides` table.
 * Caches metadata for Google Slides presentations that have been
 * accessed or created by the worker.  The primary key is the Google
 * presentation id, supplied explicitly — not auto-generated.
 */

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Metadata cache for Google Slides artifacts.
 * `id` is the Google presentationId — callers must supply it on insert.
 */
export const googleSlides = sqliteTable("google_slides", {
  /** Google presentation id.  Supplied by the caller; no default. */
  id: text("id").primaryKey(),
  /** Google account ("workspace" | "personal") that owns this presentation. */
  account: text("account").notNull(),
  /** Human-readable presentation title. */
  name: text("name").notNull(),
  /** Canonical Google Slides URL for the presentation. */
  url: text("url").notNull(),
  /** Unix-epoch timestamp of when the presentation was first indexed. */
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Zod schema for selecting rows from `google_slides`. */
export const selectGoogleSlideSchema = createSelectSchema(googleSlides);
/** Zod schema for inserting rows into `google_slides`. */
export const insertGoogleSlideSchema = createInsertSchema(googleSlides);
