import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

export const HEALTH_RUNS_TABLE_DESCRIPTION =
  "Top-level health diagnostic runs. Each run aggregates multiple individual check results and records the overall system status.";

export const HEALTH_RUNS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Unique run identifier (UUID v4).",
  status:
    "Aggregate status: healthy (all ok), degraded (some warn/fail), unhealthy (critical failures), unknown (no results).",
  trigger:
    "How the run was initiated: manual (POST /api/health/run), scheduled (cron), or agent (callable probe).",
  duration_ms: "Total wall-clock time for the run in milliseconds.",
  created_at: "Unix timestamp (seconds) when the run started.",
  metadata: "JSON object with run-level metadata (e.g. check count, skip count).",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const healthRuns = sqliteTable("health_runs", {
  id: text("id").primaryKey(),
  status: text("status", { enum: ["healthy", "degraded", "unhealthy", "unknown"] })
    .notNull()
    .default("unknown"),
  trigger: text("trigger", { enum: ["manual", "scheduled", "agent"] }).notNull(),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
});

// ---------------------------------------------------------------------------
// Zod schemas & types
// ---------------------------------------------------------------------------

export const insertHealthRunSchema = createInsertSchema(healthRuns);
export const selectHealthRunSchema = createSelectSchema(healthRuns);
export type HealthRunRow = typeof healthRuns.$inferSelect;
export type NewHealthRunRow = typeof healthRuns.$inferInsert;
