import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `projects` table for the documentation UI. */
export const PROJECTS_TABLE_DESCRIPTION =
  "Top-level project container. Each project groups tasks, notes, and activity under a named, slugged entity with lifecycle status tracking.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const PROJECTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  name: "Display name of the project.",
  slug: "URL-safe unique identifier for the project, used in routes.",
  description: "Optional longer description of the project's purpose.",
  status: "Lifecycle state: active, archived, or on_hold.",
  color: "Hex accent color used in the UI (default indigo #6366f1).",
  owner: "Display name of the project owner.",
  starred: "Whether the project is pinned/starred in the sidebar.",
  task_count: "Denormalized count of tasks belonging to this project.",
  created_at: "Unix timestamp (seconds) when the project was created.",
  updated_at: "Unix timestamp (seconds) of the last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const projects = sqliteTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  status: text("status", { enum: ["active", "archived", "on_hold"] })
    .notNull()
    .default("active"),
  color: text("color").notNull().default("#6366f1"),
  owner: text("owner").notNull().default("you"),
  starred: integer("starred", { mode: "boolean" }).notNull().default(false),
  taskCount: integer("task_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projects);
export const selectProjectSchema = createSelectSchema(projects);
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
