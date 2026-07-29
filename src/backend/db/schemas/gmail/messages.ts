/**
 * @file db/schemas/gmail/messages.ts
 * @description Relational capture of Gmail threads and messages.
 *   gmail_threads            — one row per thread
 *   gmail_messages           — one row per message, tied to a thread
 *   gmail_message_contacts   — one row per from/to/cc/bcc participant
 *   gmail_message_attachments— one row per (non-junk) attachment
 * Only messages under capture-enabled labels (see gmail_labels) are ingested.
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/** One row per Gmail thread. */
export const gmailThreads = sqliteTable("gmail_threads", {
  /** Gmail thread id. */
  id: text("id").primaryKey(),
  account: text("account").notNull(),
  subject: text("subject"),
  snippet: text("snippet"),
  /** Gmail historyId at last capture. */
  historyId: text("history_id"),
  /** Label ids on the thread (JSON array). */
  labelIdsJson: text("label_ids_json", { mode: "json" }).$type<string[]>(),
  messageCount: integer("message_count").notNull().default(0),
  /** internalDate of the newest message (Unix epoch ms). */
  lastMessageAt: integer("last_message_at"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

/** One row per Gmail message. Body text lives here; embeddings keyed by ragUuid. */
export const gmailMessages = sqliteTable("gmail_messages", {
  /** Gmail message id. */
  id: text("id").primaryKey(),
  /** Owning thread (gmail_threads.id). */
  threadId: text("thread_id").notNull(),
  account: text("account").notNull(),
  subject: text("subject"),
  snippet: text("snippet"),
  /** Vectorize record id for this message's body (null until embedded). */
  ragUuid: text("rag_uuid"),
  /** Label ids on the message (JSON array). */
  labelIdsJson: text("label_ids_json", { mode: "json" }).$type<string[]>(),
  /** Gmail internalDate (Unix epoch ms). */
  internalDate: integer("internal_date"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

/**
 * Message body, split into its own table so bodies can be pruned independently
 * (trash low-value bodies) without losing message metadata/contacts. 1:1 with
 * gmail_messages.
 */
export const gmailMessageBodies = sqliteTable(
  "gmail_message_bodies",
  {
    /** gmail_messages.id — 1:1; body is removed when the message is. */
    messageId: text("message_id")
      .primaryKey()
      .references(() => gmailMessages.id, { onDelete: "cascade" }),
    /** Full plain-text body. */
    bodyText: text("body_text"),
    /** Byte length of the body (for pruning heuristics). */
    sizeBytes: integer("size_bytes"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({ createdAtIdx: index("gmail_message_bodies_created_at_idx").on(t.createdAt) }),
);

/** One row per message participant (from/to/cc/bcc). */
export const gmailMessageContacts = sqliteTable("gmail_message_contacts", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").notNull(),
  /** "from" | "to" | "cc" | "bcc". */
  type: text("type").notNull(),
});

/**
 * One row per attachment — EVERY attachment is recorded, even skipped ones.
 * Junk (signature/logo images) is stored with `isJunk=1` + a rationale and no
 * bytes/OCR. Duplicates (identical md5 already fully processed) get `isDupe=1`,
 * a rationale, and `dupeParentId` pointing at the processed attachment, so the
 * message can reference it as if it had been processed.
 */
export const gmailMessageAttachments = sqliteTable("gmail_message_attachments", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull(),
  filename: text("filename"),
  mimetype: text("mimetype"),
  /** Reported byte size of the attachment part. */
  size: integer("size"),
  /** MD5 of the attachment bytes (dedupe / integrity). */
  md5: text("md5"),
  /** R2 object key when stored in R2. */
  r2Key: text("r2_key"),
  /** Drive file id / url when stored in Drive. */
  driveId: text("drive_id"),
  driveUrl: text("drive_url"),
  /** Extracted OCR / document text. */
  ocrText: text("ocr_text"),
  /** Vectorize record id for the attachment text. */
  ragUuid: text("rag_uuid"),
  /** Skipped as junk (not fetched/stored). */
  isJunk: integer("is_junk", { mode: "boolean" }).notNull().default(false),
  skippedRationale: text("skipped_rationale"),
  /** Skipped as a duplicate of an already-processed attachment. */
  isDupe: integer("is_dupe", { mode: "boolean" }).notNull().default(false),
  dupeRationale: text("dupe_rationale"),
  /** The fully-processed attachment this dupe mirrors (same bytes). */
  dupeParentId: text("dupe_parent_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertGmailThreadSchema = createInsertSchema(gmailThreads);
export const insertGmailMessageSchema = createInsertSchema(gmailMessages);
export const insertGmailMessageBodySchema = createInsertSchema(gmailMessageBodies);
export const insertGmailMessageContactSchema = createInsertSchema(gmailMessageContacts);
export const insertGmailMessageAttachmentSchema = createInsertSchema(gmailMessageAttachments);
export const selectGmailThreadSchema = createSelectSchema(gmailThreads);
export const selectGmailMessageSchema = createSelectSchema(gmailMessages);

export type GmailThreadRow = typeof gmailThreads.$inferSelect;
export type GmailMessageRow = typeof gmailMessages.$inferSelect;
export type GmailMessageContactRow = typeof gmailMessageContacts.$inferSelect;
export type GmailMessageAttachmentRow = typeof gmailMessageAttachments.$inferSelect;
