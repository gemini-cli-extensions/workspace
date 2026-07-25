import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `notifications` table for the documentation UI. */
export const NOTIFICATIONS_TABLE_DESCRIPTION =
  "In-app notification inbox. Each row represents a single notification surfaced to the user, with support for actor attribution, entity linking, and read state.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const NOTIFICATIONS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  type: "Notification kind: info, success, warning, error, mention, or system.",
  title: "Short headline displayed in the notification tray.",
  body: "Optional longer body copy providing detail.",
  severity: "Display severity used for visual styling (defaults to info).",
  read: "Whether the user has dismissed or acknowledged the notification.",
  actor: "Display name of the user or system that triggered the notification.",
  entity_type: "Type of entity this notification references (e.g. task, project).",
  entity_id: "ID of the specific entity this notification references.",
  href: "Optional navigation URL the notification links to.",
  created_at: "Unix timestamp (seconds) when the notification was emitted.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const notifications = sqliteTable("notifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: text("type", {
    enum: ["info", "success", "warning", "error", "mention", "system"],
  })
    .notNull()
    .default("info"),
  title: text("title").notNull(),
  body: text("body"),
  severity: text("severity").notNull().default("info"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  actor: text("actor"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  href: text("href"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertNotificationSchema = createInsertSchema(notifications);
export const selectNotificationSchema = createSelectSchema(notifications);
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
