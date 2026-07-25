import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { projects } from "../projects/projects";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `tasks` table for the documentation UI. */
export const TASKS_TABLE_DESCRIPTION =
  "Individual work items scoped to a project. Supports status, priority, assignee, labels, due dates, progress tracking, drag-drop position ordering, and self-referential parent/child (subtask) nesting via parent_id.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const TASKS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  project_id: "Foreign key into projects.id — null means inbox / unassigned.",
  parent_id:
    "Self-referential FK into tasks.id — null means a top-level task; non-null makes this task a child (subtask) of the referenced task. On parent delete the child is orphaned (set null), not cascaded.",
  title: "Short task headline.",
  description: "Optional longer body describing the task.",
  status: "Workflow state: todo, in_progress, in_review, or done.",
  priority: "Urgency level: low, medium, high, or urgent.",
  assignee: "Display name of the person responsible for this task.",
  labels: "JSON array of string label tags applied to the task.",
  due_date: "Unix timestamp (seconds) of the target completion date.",
  progress: "Integer 0–100 representing completion percentage.",
  position: "Integer sort order used for drag-drop reordering within a status column.",
  created_at: "Unix timestamp (seconds) when the task was created.",
  updated_at: "Unix timestamp (seconds) of the last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const tasks = sqliteTable("tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  /**
   * Self-referential parent task id. `null` marks a top-level task; a non-null
   * value makes this row a child (subtask) of the referenced task. On parent
   * deletion the child is orphaned (`set null`) rather than cascade-deleted, so
   * removing a parent never silently destroys its subtasks.
   */
  parentId: text("parent_id").references((): AnySQLiteColumn => tasks.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["todo", "in_progress", "in_review", "done"],
  })
    .notNull()
    .default("todo"),
  priority: text("priority", { enum: ["low", "medium", "high", "urgent"] })
    .notNull()
    .default("medium"),
  assignee: text("assignee"),
  labels: text("labels", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  dueDate: integer("due_date", { mode: "timestamp" }),
  progress: integer("progress").notNull().default(0),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasks);
export const selectTaskSchema = createSelectSchema(tasks);
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
