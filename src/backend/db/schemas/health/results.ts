import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { healthRuns } from "./runs";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

export const HEALTH_RESULTS_TABLE_DESCRIPTION =
  "Individual health check results within a run. Each row represents one diagnostic check (e.g. D1 roundtrip, Workers AI inference, Google Drive lifecycle).";

export const HEALTH_RESULTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Unique result identifier (UUID v4).",
  run_id: "Foreign key to health_runs.id. Cascade-deletes when the parent run is removed.",
  category:
    "Logical grouping: database, ai, providers, agents, google, binding, auth, api, custom.",
  name: "Human-readable check name (e.g. 'd1_roundtrip', 'workers_ai_embedding').",
  status: "Check outcome: ok, warn, fail, skipped, timeout.",
  message: "Human-readable summary of the check result.",
  details: "JSON object with check-specific structured data (latencies, counts, URLs).",
  duration_ms: "Wall-clock time for this individual check in milliseconds.",
  ai_suggestion: "AI-generated remediation suggestion for failed checks.",
  timestamp: "Unix timestamp (seconds) when this check completed.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const healthResults = sqliteTable("health_results", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => healthRuns.id, { onDelete: "cascade" }),
  category: text("category", {
    enum: ["database", "ai", "providers", "agents", "google", "binding", "auth", "api", "custom"],
  }).notNull(),
  name: text("name").notNull(),
  status: text("status", {
    enum: ["ok", "warn", "fail", "skipped", "timeout"],
  }).notNull(),
  message: text("message"),
  details: text("details", { mode: "json" }).$type<Record<string, unknown>>(),
  durationMs: integer("duration_ms").notNull().default(0),
  aiSuggestion: text("ai_suggestion"),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Zod schemas & types
// ---------------------------------------------------------------------------

export const insertHealthResultSchema = createInsertSchema(healthResults);
export const selectHealthResultSchema = createSelectSchema(healthResults);
export type HealthResultRow = typeof healthResults.$inferSelect;
export type NewHealthResultRow = typeof healthResults.$inferInsert;
