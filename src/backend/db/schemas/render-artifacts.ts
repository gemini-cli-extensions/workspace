/**
 * @file db/schemas/render-artifacts.ts
 * @description Registry of rendered screenshots (vision_qc rasterizations). The
 * bytes live in R2 (renders/ prefix); this row makes them servable to agents at
 * /api/render/:id and lets the weekly cron purge them after 90 days.
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const renderArtifacts = sqliteTable("render_artifacts", {
  /** UUID — the id in the /api/render/:id URL. */
  id: text("id").primaryKey(),
  /** Source Google file the screenshot was rendered from. */
  sourceFileId: text("source_file_id"),
  /** R2 object key holding the PNG. */
  r2Key: text("r2_key").notNull(),
  mimeType: text("mime_type").notNull().default("image/png"),
  pageCount: integer("page_count"),
  createdBySub: text("created_by_sub"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertRenderArtifactSchema = createInsertSchema(renderArtifacts);
export const selectRenderArtifactSchema = createSelectSchema(renderArtifacts);
export type RenderArtifactRow = typeof renderArtifacts.$inferSelect;
