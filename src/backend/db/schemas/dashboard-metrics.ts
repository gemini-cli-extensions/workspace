import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const DASHBOARD_METRICS_TABLE_DESCRIPTION =
  "Time-series metric samples surfaced on the operator dashboard. Generic shape — any numeric metric can be appended.";

export const DASHBOARD_METRICS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-increment sample identifier.",
  metric_name: "Stable name of the metric (e.g. `chat_broker_latency_ms`).",
  metric_value: "Numeric sample value.",
  metric_type: "Logical type tag (counter, gauge, histogram_bucket).",
  category: "Free-form grouping for dashboard slicing.",
  timestamp: "Unix timestamp (seconds) when the sample was captured.",
};

export const dashboardMetrics = sqliteTable("dashboard_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  metricName: text("metric_name").notNull(),
  metricValue: real("metric_value").notNull(),
  metricType: text("metric_type").notNull(),
  category: text("category").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const selectDashboardMetricSchema = createSelectSchema(dashboardMetrics);
export const insertDashboardMetricSchema = createInsertSchema(dashboardMetrics);
export type DashboardMetricRow = typeof dashboardMetrics.$inferSelect;
export type NewDashboardMetricRow = typeof dashboardMetrics.$inferInsert;
