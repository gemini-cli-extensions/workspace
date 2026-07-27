import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `global_config` table for the documentation UI. */
export const GLOBAL_CONFIG_TABLE_DESCRIPTION =
  "Key-value configuration store for agent rules, resume bullet points, and document template IDs. Editable via /config.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const GLOBAL_CONFIG_COLUMN_DESCRIPTIONS: Record<string, string> = {
  key: "Configuration key (primary key). Known keys: agent_rules, resume_bullets, template_ids.",
  value: "JSON-serialized configuration value. Shape depends on the key.",
  updated_at: "Unix timestamp (seconds) of the last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const globalConfig = sqliteTable("global_config", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertGlobalConfigSchema = createInsertSchema(globalConfig);
export const selectGlobalConfigSchema = createSelectSchema(globalConfig);
export type GlobalConfig = typeof globalConfig.$inferSelect;
export type NewGlobalConfig = typeof globalConfig.$inferInsert;
