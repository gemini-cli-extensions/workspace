import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

export const HEALTH_TEST_DEFINITIONS_TABLE_DESCRIPTION =
  "Registry of all known health checks. Defines the canonical name, category, and description for each diagnostic test. Populated at startup or migration time.";

export const HEALTH_TEST_DEFINITIONS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  name: "Unique check name (primary key). Must match the name used in health_results.",
  category: "Logical grouping for dashboard display.",
  description: "Human-readable description of what this check validates.",
  enabled: "1 if the check is active, 0 to skip it during runs.",
  timeout_ms: "Per-check timeout in milliseconds. Overrides the coordinator default if set.",
  created_at: "Unix timestamp (seconds) when the definition was registered.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const healthTestDefinitions = sqliteTable("health_test_definitions", {
  name: text("name").primaryKey(),
  category: text("category", {
    enum: ["database", "ai", "providers", "agents", "google", "binding", "auth", "api", "custom"],
  }).notNull(),
  description: text("description").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  timeoutMs: integer("timeout_ms"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Zod schemas & types
// ---------------------------------------------------------------------------

export const insertHealthTestDefinitionSchema = createInsertSchema(healthTestDefinitions);
export const selectHealthTestDefinitionSchema = createSelectSchema(healthTestDefinitions);
export type HealthTestDefinitionRow = typeof healthTestDefinitions.$inferSelect;
export type NewHealthTestDefinitionRow = typeof healthTestDefinitions.$inferInsert;
