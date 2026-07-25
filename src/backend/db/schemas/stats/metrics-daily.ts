import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `metrics_daily` table for the documentation UI. */
export const METRICS_DAILY_TABLE_DESCRIPTION =
  "Daily time-series data points for dashboard charts. Each row captures one named metric value for a given calendar date.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const METRICS_DAILY_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated via crypto.randomUUID().",
  date: "Calendar date in YYYY-MM-DD format that this data point belongs to.",
  metric: "Name of the metric being recorded (e.g. tasks_completed, projects_created).",
  value: "Numeric value of the metric for the given date.",
  created_at: "Unix timestamp (seconds) when this row was inserted.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const metricsDaily = sqliteTable("metrics_daily", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  date: text("date").notNull(),
  metric: text("metric").notNull(),
  value: real("value").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertMetricsDailySchema = createInsertSchema(metricsDaily);
export const selectMetricsDailySchema = createSelectSchema(metricsDaily);
export type MetricsDaily = typeof metricsDaily.$inferSelect;
export type NewMetricsDaily = typeof metricsDaily.$inferInsert;
