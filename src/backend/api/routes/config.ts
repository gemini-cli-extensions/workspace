import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import { getDb } from "../../db";
import { globalConfig, selectGlobalConfigSchema } from "../../db/schema";

const configParam = z.object({ key: z.string() });
const configValueBody = z.object({ value: z.unknown() });
const configListSchema = z.array(selectGlobalConfigSchema);

const defaultConfig = [
  {
    key: "agent_rules",
    value: ["Use precise, truthful language and avoid exposing internal project names."],
  },
  {
    key: "resume_bullets",
    value: [],
  },
  {
    key: "template_ids",
    value: { resume: "", coverLetter: "", drivePrefix: "Career Orchestrator" },
  },
  {
    key: "career_stories",
    value: "",
  },
  {
    key: "compensation_baseline",
    value: "Previous role at Google: $176,000 base salary",
  },
];

export const configRouter = new OpenAPIHono<{ Bindings: Env }>();
export const adminRouter = new OpenAPIHono<{ Bindings: Env }>();

configRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "configList",
    responses: {
      200: {
        description: "List config with isDefault flags",
        content: { "application/json": { schema: z.array(z.any()) } },
      },
    },
  }),
  async (c) => {
    const rows = await getDb(c.env).select().from(globalConfig);

    // Merge with defaults: if a key exists in DB, use the DB value; otherwise use default
    const merged = defaultConfig.map((def) => {
      const dbRow = rows.find((r) => r.key === def.key);
      const hasUserValue =
        dbRow != null &&
        dbRow.value !== null &&
        dbRow.value !== undefined &&
        (typeof dbRow.value !== "string" || dbRow.value.trim() !== "");

      return {
        key: def.key,
        value: hasUserValue ? dbRow!.value : def.value,
        updatedAt: dbRow?.updatedAt ?? null,
        isDefault: !hasUserValue,
      };
    });

    // Also include any DB rows not in defaultConfig
    for (const row of rows) {
      if (!defaultConfig.some((d) => d.key === row.key)) {
        merged.push({
          key: row.key,
          value: row.value,
          updatedAt: row.updatedAt,
          isDefault: false,
        });
      }
    }

    return c.json(merged);
  },
);

configRouter.openapi(
  createRoute({
    method: "get",
    path: "/{key}",
    operationId: "configGet",
    request: { params: configParam },
    responses: {
      200: {
        description: "Get config value",
        content: { "application/json": { schema: selectGlobalConfigSchema } },
      },
      404: { description: "Config value not found" },
    },
  }),
  async (c) => {
    const { key } = c.req.valid("param");
    const [row] = await getDb(c.env)
      .select()
      .from(globalConfig)
      .where(eq(globalConfig.key, key))
      .limit(1);

    if (row) {
      const hasUserValue =
        row.value !== null &&
        row.value !== undefined &&
        (typeof row.value !== "string" || row.value.trim() !== "");
      return c.json({ ...row, isDefault: !hasUserValue });
    }

    // Fall back to default if available
    const def = defaultConfig.find((d) => d.key === key);
    if (def) {
      return c.json({ key: def.key, value: def.value, updatedAt: null, isDefault: true });
    }

    return c.json({ error: "Config value not found" }, 404);
  },
);

configRouter.openapi(
  createRoute({
    method: "put",
    path: "/{key}",
    operationId: "configPut",
    request: {
      params: configParam,
      body: { content: { "application/json": { schema: configValueBody } } },
    },
    responses: {
      200: {
        description: "Updated config value",
        content: { "application/json": { schema: selectGlobalConfigSchema } },
      },
    },
  }),
  async (c) => {
    const { key } = c.req.valid("param");
    const { value } = c.req.valid("json");
    const row = await upsertConfig(c.env, key, value);

    return c.json(row);
  },
);

adminRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed",
    operationId: "adminSeed",
    responses: {
      200: {
        description: "Seeded config",
        content: { "application/json": { schema: configListSchema } },
      },
    },
  }),
  async (c) => {
    const rows = [];

    for (const item of defaultConfig) {
      rows.push(await upsertConfig(c.env, item.key, item.value));
    }

    return c.json(rows);
  },
);

export async function upsertConfig(env: Env, key: string, value: unknown) {
  const db = getDb(env);
  const [existing] = await db.select().from(globalConfig).where(eq(globalConfig.key, key)).limit(1);

  if (existing) {
    const [updated] = await db
      .update(globalConfig)
      .set({ value, updatedAt: new Date() })
      .where(eq(globalConfig.key, key))
      .returning();

    return updated;
  }

  const [created] = await db.insert(globalConfig).values({ key, value }).returning();

  return created;
}
