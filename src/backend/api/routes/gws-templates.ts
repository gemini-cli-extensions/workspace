/**
 * @fileoverview `/api/gws/templates` — CRUD for the template-artifacts
 * registry: reusable Google Drive templates (docs/sheets/slides/forms/drive
 * files) that agents can reference by id. Reads are public (mirrors
 * `gws.ts` /tools); writes require a signed session cookie.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { templateArtifacts } from "@db/schemas";
import { verifySessionCookie } from "@/backend/lib/cookies";

import type { AppBindings } from "../index";

export const gwsTemplatesRouter = new OpenAPIHono<AppBindings>();

const templateBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  templateType: z.enum(["doc", "sheet", "slide", "form", "drive"]),
  driveId: z.string().min(1),
  driveUrl: z.string().min(1),
  tags: z.array(z.string()).nullish(),
});

/** GET / — all templates, newest-updated first. Public read. */
gwsTemplatesRouter.get("/", async (c) => {
  const db = getDb(c.env);
  const templates = await db
    .select()
    .from(templateArtifacts)
    .orderBy(desc(templateArtifacts.updatedAt));
  return c.json({ templates });
});

/** GET /:id — a single template. Public read. */
gwsTemplatesRouter.get("/:id", async (c) => {
  const db = getDb(c.env);
  const [row] = await db
    .select()
    .from(templateArtifacts)
    .where(eq(templateArtifacts.id, c.req.param("id")))
    .limit(1);
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(row);
});

/** POST / — create a template. Auth required. */
gwsTemplatesRouter.post("/", async (c) => {
  const session = await verifySessionCookie(c.env, c.req.header("Cookie"));
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const parsed = templateBodySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
  }

  const db = getDb(c.env);
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    templateType: parsed.data.templateType,
    driveId: parsed.data.driveId,
    driveUrl: parsed.data.driveUrl,
    tags: parsed.data.tags ?? null,
    createdBySub: session.sub,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(templateArtifacts).values(row);
  return c.json(row, 201);
});

/** PUT /:id — update a template. Auth required. */
gwsTemplatesRouter.put("/:id", async (c) => {
  const session = await verifySessionCookie(c.env, c.req.header("Cookie"));
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const parsed = templateBodySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
  }

  const db = getDb(c.env);
  const id = c.req.param("id");
  const [existing] = await db
    .select()
    .from(templateArtifacts)
    .where(eq(templateArtifacts.id, id))
    .limit(1);
  if (!existing) {
    return c.json({ error: "Not found" }, 404);
  }

  const updated = {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    templateType: parsed.data.templateType,
    driveId: parsed.data.driveId,
    driveUrl: parsed.data.driveUrl,
    tags: parsed.data.tags ?? null,
    updatedAt: new Date(),
  };
  await db.update(templateArtifacts).set(updated).where(eq(templateArtifacts.id, id));
  return c.json({ ...existing, ...updated });
});

/** DELETE /:id — remove a template. Auth required. */
gwsTemplatesRouter.delete("/:id", async (c) => {
  const session = await verifySessionCookie(c.env, c.req.header("Cookie"));
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb(c.env);
  await db.delete(templateArtifacts).where(eq(templateArtifacts.id, c.req.param("id")));
  return c.json({ ok: true });
});
