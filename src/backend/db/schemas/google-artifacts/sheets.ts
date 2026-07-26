/**
 * @file db/schemas/google/sheets.ts
 * @description Drizzle schema for the `google_sheets` table.
 * Caches metadata for Google Sheets (spreadsheets) that have been
 * accessed or created by the worker.  The primary key is the Google
 * spreadsheet id, supplied explicitly — not auto-generated.
 */

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Metadata cache for Google Sheets artifacts.
 * `id` is the Google spreadsheetId — callers must supply it on insert.
 */
export const googleSheets = sqliteTable("google_sheets", {
  /** Google spreadsheet id.  Supplied by the caller; no default. */
  id: text("id").primaryKey(),
  /** Google account ("workspace" | "personal") that owns this spreadsheet. */
  account: text("account").notNull(),
  /** Human-readable spreadsheet title. */
  name: text("name").notNull(),
  /** Canonical Google Sheets URL for the spreadsheet. */
  url: text("url").notNull(),
  /** Unix-epoch timestamp of when the sheet was first indexed. */
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Zod schema for selecting rows from `google_sheets`. */
export const selectGoogleSheetSchema = createSelectSchema(googleSheets);
/** Zod schema for inserting rows into `google_sheets`. */
export const insertGoogleSheetSchema = createInsertSchema(googleSheets);
