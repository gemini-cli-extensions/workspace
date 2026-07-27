import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `preferences` table for the documentation UI. */
export const PREFERENCES_TABLE_DESCRIPTION =
  "Single logical row storing the user's UI and accessibility preferences. The row's id defaults to 'default' — upsert on that key to update.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const PREFERENCES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Fixed string key, defaults to 'default'. There is one preferences row per logical user.",
  theme: "Color scheme: system, light, or dark.",
  accent_color: "Hex accent color applied throughout the UI.",
  font_size: "Base font size token: sm, md, or lg.",
  density: "Layout density: compact, comfortable, or spacious.",
  language: "BCP 47 locale code (e.g. en, fr, de).",
  timezone: "IANA timezone string (e.g. UTC, America/New_York).",
  date_format: "Date display format string (e.g. MM/DD/YYYY).",
  time_format: "Clock format: 12h or 24h.",
  number_format: "Locale code used for number formatting (e.g. en-US).",
  animations: "Whether CSS transitions and animations are enabled.",
  reduced_motion: "Honor the OS reduced-motion preference.",
  high_contrast: "Enable high-contrast mode for improved accessibility.",
  screen_reader: "Optimise ARIA markup for screen reader users.",
  keyboard_shortcuts: "Enable global keyboard shortcut bindings.",
  updated_at: "Unix timestamp (seconds) of the last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const preferences = sqliteTable("preferences", {
  id: text("id").primaryKey().default("default"),
  theme: text("theme").notNull().default("system"),
  accentColor: text("accent_color").notNull().default("#6366f1"),
  fontSize: text("font_size").notNull().default("md"),
  density: text("density").notNull().default("comfortable"),
  language: text("language").notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  dateFormat: text("date_format").notNull().default("MM/DD/YYYY"),
  timeFormat: text("time_format").notNull().default("12h"),
  numberFormat: text("number_format").notNull().default("en-US"),
  animations: integer("animations", { mode: "boolean" }).notNull().default(true),
  reducedMotion: integer("reduced_motion", { mode: "boolean" }).notNull().default(false),
  highContrast: integer("high_contrast", { mode: "boolean" }).notNull().default(false),
  screenReader: integer("screen_reader", { mode: "boolean" }).notNull().default(false),
  keyboardShortcuts: integer("keyboard_shortcuts", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertPreferencesSchema = createInsertSchema(preferences);
export const selectPreferencesSchema = createSelectSchema(preferences);
export type Preferences = typeof preferences.$inferSelect;
export type NewPreferences = typeof preferences.$inferInsert;
