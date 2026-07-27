/**
 * @file db/schemas/google/appscript_projects.ts
 * @description Drizzle schema for the `appscript_projects` table.
 * Caches metadata for Google Apps Script projects (standalone or
 * container-bound) that have been created or accessed by the worker.
 * The primary key is the Apps Script project (script) id, supplied
 * explicitly — not auto-generated.
 */

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Metadata cache for Google Apps Script project artifacts.
 * `id` is the Google scriptId — callers must supply it on insert.
 */
export const appscriptProjects = sqliteTable("appscript_projects", {
  /** Google Apps Script project id (scriptId).  Supplied by the caller; no default. */
  id: text("id").primaryKey(),
  /** Google account ("workspace" | "personal") that owns this script project. */
  account: text("account").notNull(),
  /** Human-readable script project title. */
  title: text("title").notNull(),
  /**
   * Drive file id of the bound parent document (for container-bound scripts),
   * or null for standalone scripts.
   */
  parentId: text("parent_id"),
  /** Apps Script editor URL for the project. */
  url: text("url"),
  /** Unix-epoch timestamp of when the project was first indexed. */
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Zod schema for selecting rows from `appscript_projects`. */
export const selectAppscriptProjectSchema = createSelectSchema(appscriptProjects);
/** Zod schema for inserting rows into `appscript_projects`. */
export const insertAppscriptProjectSchema = createInsertSchema(appscriptProjects);
