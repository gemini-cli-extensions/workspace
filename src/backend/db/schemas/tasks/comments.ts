import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { tasks } from "./tasks";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `task_comments` table for the documentation UI. */
export const TASK_COMMENTS_TABLE_DESCRIPTION =
  "Discussion comments attached to a single task. Rendered oldest→newest in the task viewport's Comments thread.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const TASK_COMMENTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  task_id: "Foreign key into tasks.id — the task this comment belongs to.",
  author: "Display name of the comment's author (defaults to 'You').",
  body: "Plain-text comment body.",
  created_at: "Unix timestamp (seconds) when the comment was posted.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const taskComments = sqliteTable("task_comments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  author: text("author").notNull().default("You"),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertTaskCommentSchema = createInsertSchema(taskComments);
export const selectTaskCommentSchema = createSelectSchema(taskComments);
export type TaskComment = typeof taskComments.$inferSelect;
export type NewTaskComment = typeof taskComments.$inferInsert;
