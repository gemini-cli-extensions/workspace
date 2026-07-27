import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Push notifications received at /api/gws/drive-webhook — from either the
 * classic Drive changes.watch channel (X-Goog-* headers) or a Cloud Pub/Sub
 * push subscription fed by the Workspace Events API. Agents poll these via the
 * `list_notifications` MCP tool.
 */
export const driveNotifications = sqliteTable("drive_notifications", {
  id: text("id").primaryKey(),
  source: text("source").notNull(), // "changes" | "events"
  channelId: text("channel_id"),
  resourceId: text("resource_id"),
  resourceState: text("resource_state"),
  resourceUri: text("resource_uri"),
  messageNumber: text("message_number"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  receivedAt: integer("received_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertDriveNotificationSchema = createInsertSchema(driveNotifications);
export const selectDriveNotificationSchema = createSelectSchema(driveNotifications);
export type DriveNotificationRow = typeof driveNotifications.$inferSelect;
