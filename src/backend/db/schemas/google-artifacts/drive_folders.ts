/**
 * @file db/schemas/google/drive_folders.ts
 * @description Drizzle schema for the `drive_folders` table.
 * Caches metadata for Google Drive folders that have been accessed
 * or created by the worker.  The primary key is the Google folder id,
 * supplied explicitly — not auto-generated.
 */

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Metadata cache for Google Drive folder artifacts.
 * `id` is the Google folderId — callers must supply it on insert.
 */
export const driveFolders = sqliteTable("drive_folders", {
  /** Google Drive folder id.  Supplied by the caller; no default. */
  id: text("id").primaryKey(),
  /** Google account ("workspace" | "personal") that owns this folder. */
  account: text("account").notNull(),
  /** Human-readable folder name. */
  name: text("name").notNull(),
  /** Canonical Google Drive URL for the folder. */
  url: text("url").notNull(),
  /** Drive folder id of the parent folder, if this is a subfolder. */
  parentId: text("parent_id"),
  /** Unix-epoch timestamp of when the folder was first indexed. */
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Zod schema for selecting rows from `drive_folders`. */
export const selectDriveFolderSchema = createSelectSchema(driveFolders);
/** Zod schema for inserting rows into `drive_folders`. */
export const insertDriveFolderSchema = createInsertSchema(driveFolders);
