import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `activity_log` table for the documentation UI. */
export const ACTIVITY_LOG_TABLE_DESCRIPTION =
  "Append-only audit trail of user and system actions across all entities. Powers the activity feed on project and dashboard pages.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const ACTIVITY_LOG_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  actor: "Display name of the user or system process that performed the action.",
  action: "Verb describing what happened (e.g. created, updated, deleted, commented).",
  entity_type: "The entity type the action targeted (e.g. project, task, note).",
  entity_id: "ID of the specific entity targeted by the action.",
  summary: "Human-readable sentence summarising the event.",
  metadata: "JSON object with additional context specific to the action type.",
  created_at: "Unix timestamp (seconds) when the event occurred.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const activityLog = sqliteTable("activity_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  actor: text("actor").notNull().default("you"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertActivityLogSchema = createInsertSchema(activityLog);
export const selectActivityLogSchema = createSelectSchema(activityLog);
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type NewActivityLogEntry = typeof activityLog.$inferInsert;
