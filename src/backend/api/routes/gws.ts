/**
 * @fileoverview `/api/gws/*` — read-only routes feeding the Google Workspace
 * frontend pages: the MCP tool catalog, the operation log, and tracked
 * workspace assets (with their event history).
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { assetEvents, mcpLogs, workspaceAssets } from "@db/schemas";
import { TOOLS } from "@/backend/mcp/tools";
import { verifySessionCookie } from "@/backend/lib/cookies";

import type { AppBindings } from "../index";

export const gwsRouter = new OpenAPIHono<AppBindings>();

/** GET /tools — the MCP tool catalog with JSON-Schema input shapes. */
gwsRouter.get("/tools", (c) =>
  c.json({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.inputSchema),
    })),
  }),
);

/** GET /operations?limit= — recent google-workspace MCP call log, newest first. Auth required. */
gwsRouter.get("/operations", async (c) => {
  const session = await verifySessionCookie(c.env, c.req.header("Cookie"));
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const limit = Number(c.req.query("limit") ?? "100");
  const db = getDb(c.env);
  const operations = await db
    .select()
    .from(mcpLogs)
    .where(eq(mcpLogs.serverName, "google-workspace"))
    .orderBy(desc(mcpLogs.createdAt))
    .limit(limit);
  return c.json({ operations });
});

/** GET /assets — the caller's tracked workspace assets, newest-touched first, with their events. Auth required. */
gwsRouter.get("/assets", async (c) => {
  const session = await verifySessionCookie(c.env, c.req.header("Cookie"));
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb(c.env);
  const assets = await db
    .select()
    .from(workspaceAssets)
    .where(eq(workspaceAssets.userSub, session.sub))
    .orderBy(desc(workspaceAssets.lastTouchedAt))
    .limit(200);
  const events = await db
    .select()
    .from(assetEvents)
    .where(eq(assetEvents.userSub, session.sub))
    .orderBy(desc(assetEvents.createdAt))
    .limit(1000);

  const eventsByAsset = new Map<string, (typeof events)[number][]>();
  for (const event of events) {
    const bucket = eventsByAsset.get(event.assetId);
    if (bucket) bucket.push(event);
    else eventsByAsset.set(event.assetId, [event]);
  }

  return c.json({
    assets: assets.map((asset) => ({ ...asset, events: eventsByAsset.get(asset.id) ?? [] })),
  });
});
