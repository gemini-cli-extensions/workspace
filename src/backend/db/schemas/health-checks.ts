import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const HEALTH_CHECKS_TABLE_DESCRIPTION =
  "Legacy single-row health snapshots, kept for the bundled seed.sql. New code should write to `health_runs` + `health_results` via the HealthCoordinator instead.";

export const HEALTH_CHECKS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-increment row identifier.",
  service_name: "Logical name of the service or binding being probed.",
  status: "Free-form status string (e.g. 'ok', 'fail').",
  response_time: "Wall-clock latency in milliseconds.",
  error_message: "Captured error string when the probe failed.",
  timestamp: "Unix timestamp (seconds) when the probe completed.",
};

export const healthChecks = sqliteTable("health_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serviceName: text("service_name").notNull(),
  status: text("status").notNull(),
  responseTime: integer("response_time"),
  errorMessage: text("error_message"),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const selectHealthCheckSchema = createSelectSchema(healthChecks);
export const insertHealthCheckSchema = createInsertSchema(healthChecks);
export type HealthCheckRow = typeof healthChecks.$inferSelect;
export type NewHealthCheckRow = typeof healthChecks.$inferInsert;
