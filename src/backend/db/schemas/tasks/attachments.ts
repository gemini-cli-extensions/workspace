import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { tasks } from "./tasks";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `task_attachments` table for the documentation UI. */
export const TASK_ATTACHMENTS_TABLE_DESCRIPTION =
  "Metadata rows for files uploaded to a task. The bytes live in the R2_FILES_BUCKET at r2Key; this table only stores the pointer plus display metadata.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const TASK_ATTACHMENTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  task_id: "Foreign key into tasks.id — the task this file is attached to.",
  filename: "Original client-supplied filename, shown in the attachments list.",
  size: "File size in bytes (used to render a human-readable size).",
  content_type: "MIME type used when streaming the object back for view/download.",
  r2_key: "Object key inside the R2_FILES_BUCKET where the bytes are stored.",
  created_at: "Unix timestamp (seconds) when the file was uploaded.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const taskAttachments = sqliteTable("task_attachments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  size: integer("size"),
  contentType: text("content_type"),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertTaskAttachmentSchema = createInsertSchema(taskAttachments);
export const selectTaskAttachmentSchema = createSelectSchema(taskAttachments);
export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type NewTaskAttachment = typeof taskAttachments.$inferInsert;
