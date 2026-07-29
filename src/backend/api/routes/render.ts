/**
 * @fileoverview Serve rendered screenshots from R2. Mount at `/api/render`.
 *   GET /:id  → the PNG (gated by session cookie OR worker key).
 * Backs vision_qc screenshots so agents/users can view them via a stable URL.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { renderArtifacts } from "@db/schemas";
import { getWorkerApiKey } from "@/backend/utils/secrets";
import { constantTimeEqual } from "@/backend/lib/crypto";
import { readVerifiedSession } from "@/backend/auth/read-session";

export const renderRouter = new Hono<{ Bindings: Env }>();

renderRouter.get("/:id", async (c) => {
  const key = await getWorkerApiKey(c.env);
  const provided = c.req.header("x-worker-key") ?? (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const keyed = !!key && !!provided && constantTimeEqual(provided, key);
  const authed = keyed || (await readVerifiedSession(c.env, c.req.raw)).authed;
  if (!authed) return c.json({ error: "unauthorized" }, 401);

  const row = (await getDb(c.env).select().from(renderArtifacts).where(eq(renderArtifacts.id, c.req.param("id"))).limit(1))[0];
  if (!row) return c.json({ error: "not found" }, 404);
  const obj = await c.env.R2_FILES_BUCKET.get(row.r2Key);
  if (!obj) return c.json({ error: "expired" }, 404);

  return new Response(obj.body, { headers: { "content-type": row.mimeType, "cache-control": "private, max-age=3600" } });
});
