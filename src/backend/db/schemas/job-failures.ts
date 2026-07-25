import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `job_failures` table for the documentation UI. */
export const JOB_FAILURES_TABLE_DESCRIPTION =
  "Records failed job URL scrapes (broken links, timeouts) for debugging and retry tracking.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const JOB_FAILURES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  job_url: "The URL that failed to scrape.",
  error_message: "Human-readable error description (e.g., timeout, 404, parsing failure).",
  created_at: "Unix timestamp (seconds) of when the failure was recorded.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const jobFailures = sqliteTable("job_failures", {
  id: text("id").primaryKey(),
  jobUrl: text("job_url").notNull(),
  errorMessage: text("error_message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertJobFailureSchema = createInsertSchema(jobFailures);
export const selectJobFailureSchema = createSelectSchema(jobFailures);
export type JobFailure = typeof jobFailures.$inferSelect;
export type NewJobFailure = typeof jobFailures.$inferInsert;
