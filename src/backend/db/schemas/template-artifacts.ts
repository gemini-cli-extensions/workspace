import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Registry of reusable Google Drive templates (docs, sheets, slides, forms,
 * or plain Drive files/folders) that agents can reference by id.
 */
export const templateArtifacts = sqliteTable("template_artifacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  templateType: text("template_type").notNull(), // doc | sheet | slide | form | drive
  driveId: text("drive_id").notNull(),
  driveUrl: text("drive_url").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  createdBySub: text("created_by_sub"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertTemplateArtifactSchema = createInsertSchema(templateArtifacts);
export const selectTemplateArtifactSchema = createSelectSchema(templateArtifacts);
export type TemplateArtifactRow = typeof templateArtifacts.$inferSelect;
