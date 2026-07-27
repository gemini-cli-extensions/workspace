import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `notification_prefs` table for the documentation UI. */
export const NOTIFICATION_PREFS_TABLE_DESCRIPTION =
  "Per-channel, per-category notification preferences. One row per (channel, category) combination controls whether that class of notification is delivered.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const NOTIFICATION_PREFS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  channel: "Delivery channel: email, push, in_app, or sms.",
  category: "Notification category: tasks, mentions, projects, system, or billing.",
  enabled: "Whether notifications for this channel+category combination are active.",
  updated_at: "Unix timestamp (seconds) of the last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const notificationPrefs = sqliteTable("notification_prefs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  channel: text("channel", { enum: ["email", "push", "in_app", "sms"] }).notNull(),
  category: text("category", {
    enum: ["tasks", "mentions", "projects", "system", "billing"],
  }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertNotificationPrefsSchema = createInsertSchema(notificationPrefs);
export const selectNotificationPrefsSchema = createSelectSchema(notificationPrefs);
export type NotificationPref = typeof notificationPrefs.$inferSelect;
export type NewNotificationPref = typeof notificationPrefs.$inferInsert;
