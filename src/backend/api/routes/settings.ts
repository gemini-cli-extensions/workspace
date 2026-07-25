/**
 * @fileoverview Settings REST API router.
 *
 * Manages user preferences (single "default" row, create-on-read) and
 * notification channel/category preferences (seeded on first read).
 *
 * Mount this router at `/api/settings` in `api/index.ts`.
 *
 * Route inventory:
 *   GET  /preferences            – return the 'default' preferences row, creating it if absent
 *   PUT  /preferences            – upsert the 'default' preferences row
 *   GET  /notification-prefs     – list all channel×category rows, seeding defaults if empty
 *   PUT  /notification-prefs     – bulk upsert {channel, category, enabled}[]
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq, sql } from "drizzle-orm";

import { getDb } from "../../db";
import {
  notificationPrefs,
  preferences,
  selectNotificationPrefsSchema,
  selectPreferencesSchema,
} from "../../db/schema";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

/** PUT body — all fields optional, id is always 'default'. */
const putPreferencesBody = z.object({
  theme: z.string().optional(),
  accentColor: z.string().optional(),
  fontSize: z.string().optional(),
  density: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  dateFormat: z.string().optional(),
  timeFormat: z.string().optional(),
  numberFormat: z.string().optional(),
  animations: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  screenReader: z.boolean().optional(),
  keyboardShortcuts: z.boolean().optional(),
});

/** Single channel+category+enabled item for the bulk PUT. */
const notifPrefItem = z.object({
  channel: z.enum(["email", "push", "in_app", "sms"]),
  category: z.enum(["tasks", "mentions", "projects", "system", "billing"]),
  enabled: z.boolean(),
});

const putNotifPrefsBody = z.array(notifPrefItem).min(1);

// Default matrix: every channel × every category starts enabled
const DEFAULT_CHANNELS = ["email", "push", "in_app", "sms"] as const;
const DEFAULT_CATEGORIES = ["tasks", "mentions", "projects", "system", "billing"] as const;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const settingsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /preferences
// ---------------------------------------------------------------------------

settingsRouter.openapi(
  createRoute({
    method: "get",
    path: "/preferences",
    tags: ["Settings"],
    summary: "Get user preferences (create default row if absent)",
    operationId: "settingsGetPreferences",
    responses: {
      200: {
        description: "User preferences row.",
        content: { "application/json": { schema: selectPreferencesSchema } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    let [row] = await db.select().from(preferences).where(eq(preferences.id, "default")).limit(1);
    if (!row) {
      // Create on read — idempotent default row
      const [created] = await db
        .insert(preferences)
        .values({ id: "default", updatedAt: new Date() })
        .returning();
      row = created!;
    }
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// PUT /preferences
// ---------------------------------------------------------------------------

settingsRouter.openapi(
  createRoute({
    method: "put",
    path: "/preferences",
    tags: ["Settings"],
    summary: "Upsert user preferences",
    operationId: "settingsPutPreferences",
    request: {
      body: { content: { "application/json": { schema: putPreferencesBody } } },
    },
    responses: {
      200: {
        description: "Updated preferences row.",
        content: { "application/json": { schema: selectPreferencesSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);

    // Upsert — insert or update the single 'default' row
    const [row] = await db
      .insert(preferences)
      .values({ id: "default", ...body, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: preferences.id,
        set: { ...body, updatedAt: new Date() },
      })
      .returning();
    return c.json(row!, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /notification-prefs
// ---------------------------------------------------------------------------

settingsRouter.openapi(
  createRoute({
    method: "get",
    path: "/notification-prefs",
    tags: ["Settings"],
    summary: "List notification preferences, seeding defaults if empty",
    operationId: "settingsGetNotifPrefs",
    responses: {
      200: {
        description: "All channel × category notification preference rows.",
        content: { "application/json": { schema: z.array(selectNotificationPrefsSchema) } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    let rows = await db.select().from(notificationPrefs);

    if (rows.length === 0) {
      // Seed defaults: every channel × every category = enabled
      const seeds = DEFAULT_CHANNELS.flatMap((channel) =>
        DEFAULT_CATEGORIES.map((category) => ({
          channel,
          category,
          enabled: true,
          updatedAt: new Date(),
        })),
      );
      rows = await db.insert(notificationPrefs).values(seeds).returning();
    }

    return c.json(rows, 200);
  },
);

// ---------------------------------------------------------------------------
// PUT /notification-prefs
// ---------------------------------------------------------------------------

settingsRouter.openapi(
  createRoute({
    method: "put",
    path: "/notification-prefs",
    tags: ["Settings"],
    summary: "Bulk upsert notification preferences",
    operationId: "settingsPutNotifPrefs",
    request: {
      body: { content: { "application/json": { schema: putNotifPrefsBody } } },
    },
    responses: {
      200: {
        description: "Updated notification preference rows.",
        content: { "application/json": { schema: z.array(selectNotificationPrefsSchema) } },
      },
    },
  }),
  async (c) => {
    const items = c.req.valid("json");
    const db = getDb(c.env);

    // For each item, upsert by (channel, category). D1 doesn't support multi-row
    // onConflict on composite keys via Drizzle, so we run individual upserts.
    const results: (typeof notificationPrefs.$inferSelect)[] = [];
    for (const item of items) {
      const [existing] = await db
        .select()
        .from(notificationPrefs)
        .where(
          sql`${notificationPrefs.channel} = ${item.channel} AND ${notificationPrefs.category} = ${item.category}`,
        )
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(notificationPrefs)
          .set({ enabled: item.enabled, updatedAt: new Date() })
          .where(eq(notificationPrefs.id, existing.id))
          .returning();
        results.push(updated!);
      } else {
        const [created] = await db
          .insert(notificationPrefs)
          .values({ ...item, updatedAt: new Date() })
          .returning();
        results.push(created!);
      }
    }

    return c.json(results, 200);
  },
);
