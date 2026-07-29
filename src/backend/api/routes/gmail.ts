/**
 * @fileoverview Gmail REST router — semantic search over captured mail.
 * Mount at `/api/gmail`. Backs the frontend search page; the same logic is
 * exposed to agents via the `gmail_rag_search` MCP tool.
 *
 * Route inventory:
 *   POST /search  – { query, account?, topK? } → { hits }
 */
import { Hono } from "hono";

import { searchGmail } from "@/backend/gmail/search-service";

export const gmailRouter = new Hono<{ Bindings: Env }>();

gmailRouter.post("/search", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { query?: string; account?: string; topK?: number };
  const query = (body.query ?? "").trim();
  if (!query) return c.json({ error: "query is required" }, 400);
  const hits = await searchGmail(c.env, query, { account: body.account, topK: body.topK });
  return c.json({ hits });
});
