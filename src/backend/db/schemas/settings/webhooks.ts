import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `webhooks` table for the documentation UI. */
export const WEBHOOKS_TABLE_DESCRIPTION =
  "Outbound webhook registrations. Each row defines an endpoint that receives HTTP POST payloads for the subscribed event types.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const WEBHOOKS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  name: "Friendly display name for the webhook registration.",
  url: "Destination URL that will receive the POST payload.",
  events: "JSON array of event type strings this webhook is subscribed to.",
  secret: "Optional HMAC signing secret used to verify delivery.",
  active: "Whether the webhook is currently enabled for delivery.",
  last_status: "HTTP status code (as text) from the most recent delivery attempt.",
  last_triggered_at: "Unix timestamp (seconds) of the most recent delivery attempt.",
  created_at: "Unix timestamp (seconds) when the webhook was registered.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const webhooks = sqliteTable("webhooks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  url: text("url").notNull(),
  events: text("events", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  secret: text("secret"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastStatus: text("last_status"),
  lastTriggeredAt: integer("last_triggered_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertWebhookSchema = createInsertSchema(webhooks);
export const selectWebhookSchema = createSelectSchema(webhooks);
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
