import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { tasks } from "./tasks";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `task_subtasks` table for the documentation UI. */
export const TASK_SUBTASKS_TABLE_DESCRIPTION =
  "Checklist items that break a task into smaller steps. The parent task's progress is derived from the ratio of done subtasks.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const TASK_SUBTASKS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  task_id: "Foreign key into tasks.id — the task this subtask belongs to.",
  title: "Short label for the checklist item.",
  done: "Whether this subtask has been completed.",
  position: "Integer sort order within the parent task's checklist.",
  created_at: "Unix timestamp (seconds) when the subtask was created.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const taskSubtasks = sqliteTable("task_subtasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertTaskSubtaskSchema = createInsertSchema(taskSubtasks);
export const selectTaskSubtaskSchema = createSelectSchema(taskSubtasks);
export type TaskSubtask = typeof taskSubtasks.$inferSelect;
export type NewTaskSubtask = typeof taskSubtasks.$inferInsert;
