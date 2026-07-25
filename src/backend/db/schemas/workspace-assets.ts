import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const workspaceAssets = sqliteTable(
  "workspace_assets",
  {
    id: text("id").primaryKey(),
    userSub: text("user_sub").notNull(),
    assetType: text("asset_type").notNull(), // doc | sheet | drive | gmail
    googleId: text("google_id").notNull(),
    title: text("title"),
    url: text("url"),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastTouchedAt: integer("last_touched_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({ uniq: unique().on(t.userSub, t.assetType, t.googleId) }),
);

export const assetEvents = sqliteTable("asset_events", {
  id: text("id").primaryKey(),
  assetId: text("asset_id")
    .notNull()
    .references(() => workspaceAssets.id),
  userSub: text("user_sub").notNull(),
  action: text("action").notNull(), // read | create | update | modify | delete
  detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
  toolName: text("tool_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertWorkspaceAssetSchema = createInsertSchema(workspaceAssets);
export const selectWorkspaceAssetSchema = createSelectSchema(workspaceAssets);
export const insertAssetEventSchema = createInsertSchema(assetEvents);
export const selectAssetEventSchema = createSelectSchema(assetEvents);
export type WorkspaceAssetRow = typeof workspaceAssets.$inferSelect;
export type AssetEventRow = typeof assetEvents.$inferSelect;
