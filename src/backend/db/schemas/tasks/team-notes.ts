import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { projects } from "../projects/projects";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `team_notes` table for the documentation UI. */
export const TEAM_NOTES_TABLE_DESCRIPTION =
  "Rich-text notes attached to a project. Supports pinning for quick access by all team members.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const TEAM_NOTES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  project_id: "Foreign key into projects.id — null means a global/unscoped note.",
  title: "Short headline for the note.",
  body: "Full note body text (markdown or plain text).",
  author: "Display name of the note's author.",
  pinned: "Whether the note is pinned to the top of the notes list.",
  created_at: "Unix timestamp (seconds) when the note was created.",
  updated_at: "Unix timestamp (seconds) of the last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const teamNotes = sqliteTable("team_notes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  author: text("author").notNull().default("you"),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertTeamNoteSchema = createInsertSchema(teamNotes);
export const selectTeamNoteSchema = createSelectSchema(teamNotes);
export type TeamNote = typeof teamNotes.$inferSelect;
export type NewTeamNote = typeof teamNotes.$inferInsert;
