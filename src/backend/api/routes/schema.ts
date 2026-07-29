/**
 * @fileoverview Google API grammar router. Mount at `/api/schema`.
 *   GET /:surface           – full Discovery doc (KV-cached)
 *   GET /:surface/recipes   – curated request patterns
 * Surfaces: docs | slides | sheets | forms.
 */
import { Hono } from "hono";

import { getDiscovery, isSchemaSurface, RECIPES } from "@/backend/docs/schema";

export const schemaRouter = new Hono<{ Bindings: Env }>();

schemaRouter.get("/:surface/recipes", (c) => {
  const s = c.req.param("surface");
  if (!isSchemaSurface(s)) return c.json({ error: "unknown surface" }, 404);
  return c.json({ recipes: RECIPES[s] });
});

schemaRouter.get("/:surface", async (c) => {
  const s = c.req.param("surface");
  if (!isSchemaSurface(s)) return c.json({ error: "unknown surface" }, 404);
  const disc = await getDiscovery(c.env, s);
  if (!disc) return c.json({ error: "discovery unavailable" }, 502);
  return c.json(disc);
});
