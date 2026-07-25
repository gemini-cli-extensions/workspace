import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

export const BEST_PRACTICES_TABLE_DESCRIPTION =
  "Curated engineering best practices used as reference material for agents and surfaced in the dashboard playbook view.";

export const BEST_PRACTICES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Unique identifier (UUID v4).",
  category: "Logical grouping: workers, durable_objects, agents, frontend, security, observability, custom.",
  rule: "Short imperative statement of the practice (one sentence).",
  rationale: "Why this practice exists. Long-form explanation.",
  source_url: "Optional canonical reference (Cloudflare docs URL, RFC, etc.).",
  tags: "JSON array of free-form tags for filtering.",
  created_at: "Unix timestamp (seconds) when the record was first inserted.",
  updated_at: "Unix timestamp (seconds) of the most recent edit.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const bestPractices = sqliteTable("best_practices", {
  id: text("id").primaryKey(),
  category: text("category", {
    enum: [
      "workers",
      "durable_objects",
      "agents",
      "frontend",
      "security",
      "observability",
      "custom",
    ],
  }).notNull(),
  rule: text("rule").notNull(),
  rationale: text("rationale").notNull(),
  sourceUrl: text("source_url"),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Zod schemas & types
// ---------------------------------------------------------------------------

export const insertBestPracticeSchema = createInsertSchema(bestPractices);
export const selectBestPracticeSchema = createSelectSchema(bestPractices);
export type BestPracticeRow = typeof bestPractices.$inferSelect;
export type NewBestPracticeRow = typeof bestPractices.$inferInsert;
