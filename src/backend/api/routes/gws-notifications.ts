/**
 * @fileoverview `/api/gws/notifications` — recent Drive/Workspace Events push
 * notifications recorded by the `/api/gws/drive-webhook` receiver (see
 * `drive-webhook.ts`), newest first. Feeds the `/gws/notifications` page.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { desc } from "drizzle-orm";

import { getDb } from "@/db";
import { driveNotifications } from "@db/schemas";
import { verifySessionCookie } from "@/backend/lib/cookies";

import type { AppBindings } from "../index";

export const gwsNotificationsRouter = new OpenAPIHono<AppBindings>();

/** GET / — recent Drive push notifications, newest first. Auth required. */
gwsNotificationsRouter.get("/", async (c) => {
  const session = await verifySessionCookie(c.env, c.req.header("Cookie"));
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const limit = Number(c.req.query("limit") ?? "100");
  const db = getDb(c.env);
  const notifications = await db
    .select()
    .from(driveNotifications)
    .orderBy(desc(driveNotifications.receivedAt))
    .limit(limit);
  return c.json({ notifications });
});
