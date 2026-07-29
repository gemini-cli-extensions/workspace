/**
 * @file db/schemas/gmail/labels.ts
 * @description Registry of every Gmail label, kept in sync with the account.
 * Labels are registered here regardless of how they were created (worker or
 * manually in Gmail). A weekly cron reconciles: new labels are inserted,
 * labels that disappear from Gmail are soft-deleted (`is_active = 0`).
 *
 * Per-label capture config drives the message-ingestion pipeline: only labels
 * with a capture_mode other than "none" have their messages captured.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const gmailLabels = sqliteTable("gmail_labels", {
  /** Gmail label id (e.g. "Label_123" / "INBOX"). */
  id: text("id").primaryKey(),
  /** Account this label belongs to (OAuth sub / impersonated email). */
  account: text("account").notNull(),
  /** Full label name, including nesting path ("Clients/Acme"). */
  name: text("name").notNull(),
  /** Parent label id when nested (derived from the name path). */
  parentId: text("parent_id"),
  /** Optional human description (worker metadata, not stored in Gmail). */
  description: text("description"),
  /** 1 = present in Gmail, 0 = soft-deleted (gone from Gmail, kept for history). */
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  /**
   * Capture behavior for messages under this label:
   * "none" = ignore, "metadata" = store in D1 only, "vectorize" = D1 + embed.
   */
  captureMode: text("capture_mode").notNull().default("none"),
  /** Whether to capture attachments for this label's messages. */
  captureAttachments: integer("capture_attachments", { mode: "boolean" }).notNull().default(false),
  /** Where captured attachments live: "r2" | "drive" (null when not capturing). */
  attachmentStore: text("attachment_store"),
  /** Destination Drive folder id when attachmentStore = "drive". */
  attachmentDriveFolderId: text("attachment_drive_folder_id"),
  /** Captured Gmail filter criteria that auto-apply this label (JSON). */
  filtersJson: text("filters_json", { mode: "json" }).$type<Record<string, unknown>[]>(),
  /** How this row was first registered: "worker" | "sync". */
  createdVia: text("created_via").notNull().default("sync"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertGmailLabelSchema = createInsertSchema(gmailLabels);
export const selectGmailLabelSchema = createSelectSchema(gmailLabels);
export type GmailLabelRow = typeof gmailLabels.$inferSelect;
export type NewGmailLabelRow = typeof gmailLabels.$inferInsert;
