/**
 * @fileoverview Drizzle table for the Email Routing "Inbox" showcase.
 *
 * The `email_messages` table is the persistence layer for the end-to-end
 * Cloudflare Email Routing demo:
 *
 *   incoming email → Worker `email()` handler → parse + store HERE → two-pane UI
 *
 * A row is created every time the Worker's `email()` handler (see
 * `src/_worker.ts`) receives a `ForwardableEmailMessage` for a routed address.
 * The reading-pane UI (`src/frontend/components/inbox/**`) renders these rows,
 * and the REST API (`src/backend/api/routes/inbox.ts`) lists / mutates them.
 *
 * Columns mirror the shape of a real mail item: envelope addresses, a parsed
 * subject + plain-text/HTML body, a precomputed snippet (first ~140 chars for
 * the list pane), folder + label organization, read/star flags, the received
 * timestamp, and the raw RFC822 size for display.
 *
 * Add new inbox tables under this folder and re-export them from
 * `./index.ts`, which is re-exported by the schemas root barrel
 * (`src/backend/db/schema.ts`).
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema and /docs)
// ---------------------------------------------------------------------------

/** Human-readable description of the `email_messages` table for the docs UI. */
export const EMAIL_MESSAGES_TABLE_DESCRIPTION =
  "Incoming emails received via Cloudflare Email Routing. Each row is created by the Worker's email() handler from a ForwardableEmailMessage: the raw MIME is parsed into envelope addresses, a subject, plain-text/HTML bodies, and a short snippet, then organized into folders/labels with read & starred flags for the two-pane inbox showcase.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const EMAIL_MESSAGES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  from_address: "SMTP envelope sender (MAIL FROM) — message.from. Trustworthy, not spoofable like header addresses.",
  from_name: "Optional display name parsed from the From: header (e.g. \"Jane Doe\").",
  to_address: "SMTP envelope recipient (RCPT TO) — message.to. The routed address that hit this Worker.",
  subject: "Parsed Subject: header, defaulting to \"(no subject)\" when absent.",
  text_body: "Plain-text body extracted from the MIME message (or an HTML fallback).",
  html_body: "Optional HTML body when the message carried a text/html part.",
  snippet: "First ~140 characters of the text body, precomputed for the list pane.",
  folder: "Organization bucket: inbox | archive | spam. New mail lands in inbox.",
  labels: "JSON array of string label tags applied to the message.",
  read: "Whether the message has been opened in the reading pane.",
  starred: "Whether the user has starred the message for quick access.",
  received_at: "Timestamp the email() handler stored the message (epoch, ms-backed Date).",
  raw_size: "Size in bytes of the raw RFC822 MIME content (message.rawSize).",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

/** Folder buckets a message can live in. */
export const EMAIL_FOLDERS = ["inbox", "archive", "spam"] as const;

/**
 * `email_messages` — one row per received email.
 *
 * Written by the Worker `email()` handler (ingest) and the demo seed route;
 * read + mutated (read/starred/folder) by the inbox REST API.
 */
export const emailMessages = sqliteTable("email_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  fromAddress: text("from_address").notNull(),
  fromName: text("from_name"),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull().default("(no subject)"),
  textBody: text("text_body").notNull().default(""),
  htmlBody: text("html_body"),
  snippet: text("snippet").notNull().default(""),
  folder: text("folder", { enum: EMAIL_FOLDERS }).notNull().default("inbox"),
  labels: text("labels", { mode: "json" }).$type<string[]>().notNull().default([]),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  starred: integer("starred", { mode: "boolean" }).notNull().default(false),
  receivedAt: integer("received_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  rawSize: integer("raw_size").notNull().default(0),
});

// ---------------------------------------------------------------------------
// drizzle-zod schemas + inferred types
// ---------------------------------------------------------------------------

export const insertEmailMessageSchema = createInsertSchema(emailMessages);
export const selectEmailMessageSchema = createSelectSchema(emailMessages);
export type EmailMessage = typeof emailMessages.$inferSelect;
export type NewEmailMessage = typeof emailMessages.$inferInsert;
