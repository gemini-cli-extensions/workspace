/**
 * @fileoverview AppScript → worker AI bridge. Mount at `/api/appscript`.
 * A (container-bound) Apps Script calls this via UrlFetchApp to run an AI op
 * through the worker — e.g. a Doc sidebar chatting with the agent. Authenticated
 * with the WORKER_API_KEY (the script holds it as a Script Property).
 *
 *   POST /ai  { prompt, model? }  →  { text }
 */
import { Hono } from "hono";

import { getWorkerApiKey } from "@/backend/utils/secrets";
import { constantTimeEqual } from "@/backend/lib/crypto";

export const appscriptRouter = new Hono<{ Bindings: Env }>();

appscriptRouter.post("/ai", async (c) => {
  const key = await getWorkerApiKey(c.env);
  const provided = c.req.header("x-worker-key") ?? (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!key || !provided || !constantTimeEqual(provided, key)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = (await c.req.json().catch(() => ({}))) as { prompt?: string; model?: string };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return c.json({ error: "prompt is required" }, 400);

  const model = body.model || c.env.MODEL_CHAT || "@cf/openai/gpt-oss-120b";
  const out = (await (c.env.AI as any).run(model, { messages: [{ role: "user", content: prompt }] })) as {
    response?: string;
  };
  return c.json({ text: out?.response ?? JSON.stringify(out) });
});
