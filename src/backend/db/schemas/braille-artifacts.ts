/**
 * @file db/schemas/braille-artifacts.ts
 * @description Drizzle schema for `braille_artifacts` — the reusable
 * component & template library. Each row stores a chunk of Google's own
 * document JSON ("braille"): either a whole-document `template`, or a
 * `component` extracted from it (an anchor-tagged block in a Doc, a slide in
 * a deck, a tab in a Sheet). Agents read these back and replay them through
 * batchUpdate to build or restyle documents.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const brailleArtifacts = sqliteTable("braille_artifacts", {
  /** UUID v4. */
  id: text("id").primaryKey(),
  /** Google file id the braille was deconstructed from. */
  sourceFileId: text("source_file_id"),
  /** Canonical URL of the source file, if known. */
  sourceUrl: text("source_url"),
  /** Which surface the structure targets: `doc` | `slide` | `sheet`. */
  surface: text("surface").notNull(),
  /** `template` (whole file) or `component` (extracted piece). */
  kind: text("kind").notNull(),
  /** Human-readable name. */
  name: text("name").notNull(),
  /** Component anchor / identifier within the source (null for templates). */
  anchor: text("anchor"),
  /** The braille itself — Google document JSON, batchUpdate-replayable. */
  structure: text("structure", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  /** Free-form tags for search/remix. */
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  /** Subject (user id) that indexed this artifact. */
  createdBySub: text("created_by_sub"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertBrailleArtifactSchema = createInsertSchema(brailleArtifacts);
export const selectBrailleArtifactSchema = createSelectSchema(brailleArtifacts);
export type BrailleArtifactRow = typeof brailleArtifacts.$inferSelect;
export type NewBrailleArtifactRow = typeof brailleArtifacts.$inferInsert;
