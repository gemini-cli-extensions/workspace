/**
 * @fileoverview Scheduled-task management routes (the Tasks scheduling wizard),
 * ported from `core-gsuite-tools` Phase 3.
 *
 * MOUNTED AT `/api/agent-tasks` (not `/api/tasks`): this Worker already has an
 * unrelated project-management `tasksRouter` at `/api/tasks` (see
 * `src/backend/api/routes/tasks.ts`). This router is a distinct domain — saved
 * Workspace-automation schedules — kept under its own prefix to avoid colliding
 * with that existing feature. The frontend `lib/scheduler-api.ts` is adjusted
 * to match.
 *
 * A scheduled task is a SAVED action definition (`scheduledTasks`) bound to one
 * or more accounts, with parameters, a frequency, an optional prompt, and
 * optional indexing. Each fire produces a `task_events` progress feed.
 *
 * DO-INSTANCE NAMING SCHEME: all scheduling RPCs target ONE singleton Durable
 * Object instance per agent surface, named `"scheduler"`, resolved via
 * `getAgentByName(env.<AGENT>_AGENT, "scheduler")`. Every surface — including
 * Calendar (`CALENDAR_AGENT`) — is a DO-backed agent, so all actions run through
 * the agent's `runGsuiteTask`/`scheduleGsuiteTask`.
 *
 * Routes:
 *  GET    /api/agent-tasks               — list scheduled-task definitions
 *  POST   /api/agent-tasks               — create a definition (+ register schedule)
 *  GET    /api/agent-tasks/:id           — get a definition + its run events
 *  POST   /api/agent-tasks/:id/run       — run the definition now (on-demand)
 *  POST   /api/agent-tasks/:id/pause     — cancel schedule(s), mark paused
 *  POST   /api/agent-tasks/:id/resume    — re-register schedule(s), mark active
 *  DELETE /api/agent-tasks/:id           — cancel schedule(s) + delete the definition
 *  GET    /api/agent-tasks/:id/events    — run-event feed
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getAgentByName } from "agents";
import { desc, eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import {
  scheduledTasks,
  taskEvents,
  selectScheduledTaskSchema,
  selectTaskEventSchema,
} from "@db/schemas";

import type { SpecialistAgent } from "@/backend/ai/agents/orchestrator/methods/route";

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

/** z.any() keeps drizzle Date fields from breaking the @hono/zod-openapi handler types. */
const AnySchema = z.any();

export const agentTasksRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Agent-surface routing
// ---------------------------------------------------------------------------

/** Singleton DO instance name used for every scheduler RPC. */
const SCHEDULER_INSTANCE = "scheduler";

/** Map of DO-backed agent surface → its Env namespace binding name. */
const AGENT_BINDING: Record<string, keyof Env> = {
  gmail: "GMAIL_AGENT",
  docs: "DOCS_AGENT",
  sheets: "SHEETS_AGENT",
  slides: "SLIDES_AGENT",
  drive: "DRIVE_AGENT",
  appscript: "APPSSCRIPT_AGENT",
  calendar: "CALENDAR_AGENT",
};

/** Whether an agent surface is backed by a Durable Object agent. */
function isDoAgent(agent: string): boolean {
  return agent in AGENT_BINDING;
}

/**
 * Resolve the singleton scheduler stub for a DO-backed agent surface.
 */
async function schedulerFor(
  env: Env,
  agent: string,
): Promise<DurableObjectStub<SpecialistAgent>> {
  const binding = AGENT_BINDING[agent];
  const namespace = env[binding] as unknown as DurableObjectNamespace<SpecialistAgent>;
  return getAgentByName<Env, SpecialistAgent>(namespace, SCHEDULER_INSTANCE);
}

// ---------------------------------------------------------------------------
// GET /api/agent-tasks — list definitions
// ---------------------------------------------------------------------------

agentTasksRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Tasks"],
    summary: "List scheduled-task definitions",
    operationId: "agentTasksList",
    request: { query: z.object({ agent: z.string().optional(), status: z.string().optional() }) },
    responses: {
      200: { description: "Definitions", content: { "application/json": { schema: z.object({ data: z.array(AnySchema) }) } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { agent, status } = c.req.valid("query");
    const db = getDb(c.env);
    const rows = await db.select().from(scheduledTasks).orderBy(desc(scheduledTasks.createdAt));
    const filtered = rows.filter((r) => (!agent || r.agent === agent) && (!status || r.status === status));
    return c.json({ data: filtered } as { data: any[] }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /api/agent-tasks — create a definition + register schedule
// ---------------------------------------------------------------------------

const CreateBody = z.object({
  title: z.string().min(1),
  accounts: z.array(z.string()).min(1),
  agent: z.string(),
  action: z.string(),
  params: z.record(z.string(), z.any()).default({}),
  prompt: z.string().optional(),
  frequency: z.enum(["on_demand", "once", "interval", "cron"]),
  scheduleSpec: z.string().optional(),
  indexToD1: z.boolean().default(false),
  indexVectorizeCorpus: z.enum(["emails", "docs", "general"]).nullish(),
  source: z.enum(["ui", "mcp", "api", "rpc"]).default("ui"),
});

agentTasksRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Tasks"],
    summary: "Create a scheduled-task definition",
    operationId: "agentTasksCreate",
    request: { body: { content: { "application/json": { schema: CreateBody } }, required: true } },
    responses: {
      200: { description: "Definition", content: { "application/json": { schema: z.object({ data: AnySchema }) } } },
      400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);

    if (body.frequency !== "on_demand" && !isDoAgent(body.agent)) {
      return c.json(
        { error: { code: "UNSUPPORTED", message: `Agent "${body.agent}" supports on_demand tasks only (no scheduler).` } } as { error: { code: string; message: string } },
        400,
      );
    }
    if (body.frequency !== "on_demand" && !body.scheduleSpec) {
      return c.json(
        { error: { code: "BAD_REQUEST", message: `scheduleSpec is required for frequency "${body.frequency}".` } } as { error: { code: string; message: string } },
        400,
      );
    }

    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(scheduledTasks).values({
      id,
      title: body.title,
      accountsJson: body.accounts,
      agent: body.agent as (typeof scheduledTasks.$inferInsert)["agent"],
      action: body.action,
      paramsJson: body.params,
      promptText: body.prompt ?? null,
      frequency: body.frequency,
      scheduleSpec: body.scheduleSpec ?? null,
      scheduleIdsJson: null,
      indexToD1: body.indexToD1,
      indexVectorizeCorpus: body.indexVectorizeCorpus ?? null,
      status: "active",
      source: body.source,
      createdAt: now,
      updatedAt: now,
    });

    if (body.frequency !== "on_demand" && isDoAgent(body.agent)) {
      const stub = await schedulerFor(c.env, body.agent);
      await stub.scheduleGsuiteTask(id);
    }

    const rows = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)).limit(1);
    return c.json({ data: rows[0] } as { data: any }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /api/agent-tasks/:id — definition + run events
// ---------------------------------------------------------------------------

agentTasksRouter.openapi(
  createRoute({
    method: "get",
    path: "/:id",
    tags: ["Tasks"],
    summary: "Get a scheduled-task definition",
    operationId: "agentTasksGet",
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      200: { description: "Definition", content: { "application/json": { schema: z.object({ data: AnySchema }) } } },
      404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const rows = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)).limit(1);
    if (!rows.length) {
      return c.json({ error: { code: "NOT_FOUND", message: `Task ${id} not found` } } as { error: { code: string; message: string } }, 404);
    }
    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, id));
    return c.json({ data: { ...rows[0], events } } as { data: any }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /api/agent-tasks/:id/run — run now (on-demand)
// ---------------------------------------------------------------------------

agentTasksRouter.openapi(
  createRoute({
    method: "post",
    path: "/:id/run",
    tags: ["Tasks"],
    summary: "Run a scheduled-task definition now",
    operationId: "agentTasksRunNow",
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      200: { description: "Ran", content: { "application/json": { schema: z.object({ data: AnySchema }) } } },
      404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const rows = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)).limit(1);
    if (!rows.length) {
      return c.json({ error: { code: "NOT_FOUND", message: `Task ${id} not found` } } as { error: { code: string; message: string } }, 404);
    }
    const def = rows[0];

    const stub = await schedulerFor(c.env, def.agent);
    await stub.runGsuiteTask({ defId: id });

    return c.json({ data: { ran: true } } as { data: any }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /api/agent-tasks/:id/pause — cancel schedule(s), mark paused
// ---------------------------------------------------------------------------

agentTasksRouter.openapi(
  createRoute({
    method: "post",
    path: "/:id/pause",
    tags: ["Tasks"],
    summary: "Pause a scheduled-task definition",
    operationId: "agentTasksPause",
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      200: { description: "Paused", content: { "application/json": { schema: z.object({ data: AnySchema }) } } },
      404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const rows = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)).limit(1);
    if (!rows.length) {
      return c.json({ error: { code: "NOT_FOUND", message: `Task ${id} not found` } } as { error: { code: string; message: string } }, 404);
    }
    const def = rows[0];
    const ids = Array.isArray(def.scheduleIdsJson) ? def.scheduleIdsJson : [];
    if (ids.length && isDoAgent(def.agent)) {
      const stub = await schedulerFor(c.env, def.agent);
      await stub.cancelGsuiteTask(ids);
    }
    await db
      .update(scheduledTasks)
      .set({ status: "paused", scheduleIdsJson: [], nextRunAt: null, updatedAt: new Date() })
      .where(eq(scheduledTasks.id, id));
    const updated = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)).limit(1);
    return c.json({ data: updated[0] } as { data: any }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /api/agent-tasks/:id/resume — re-register schedule(s), mark active
// ---------------------------------------------------------------------------

agentTasksRouter.openapi(
  createRoute({
    method: "post",
    path: "/:id/resume",
    tags: ["Tasks"],
    summary: "Resume a scheduled-task definition",
    operationId: "agentTasksResume",
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      200: { description: "Resumed", content: { "application/json": { schema: z.object({ data: AnySchema }) } } },
      404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const rows = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)).limit(1);
    if (!rows.length) {
      return c.json({ error: { code: "NOT_FOUND", message: `Task ${id} not found` } } as { error: { code: string; message: string } }, 404);
    }
    const def = rows[0];
    if (def.frequency !== "on_demand" && isDoAgent(def.agent)) {
      const stub = await schedulerFor(c.env, def.agent);
      await stub.scheduleGsuiteTask(id);
    } else {
      await db.update(scheduledTasks).set({ status: "active", updatedAt: new Date() }).where(eq(scheduledTasks.id, id));
    }
    const updated = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)).limit(1);
    return c.json({ data: updated[0] } as { data: any }, 200);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/agent-tasks/:id — cancel schedule(s) + delete the definition
// ---------------------------------------------------------------------------

agentTasksRouter.openapi(
  createRoute({
    method: "delete",
    path: "/:id",
    tags: ["Tasks"],
    summary: "Delete a scheduled-task definition",
    operationId: "agentTasksDelete",
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      200: { description: "Deleted", content: { "application/json": { schema: z.object({ data: AnySchema }) } } },
      404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const rows = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)).limit(1);
    if (!rows.length) {
      return c.json({ error: { code: "NOT_FOUND", message: `Task ${id} not found` } } as { error: { code: string; message: string } }, 404);
    }
    const def = rows[0];
    const ids = Array.isArray(def.scheduleIdsJson) ? def.scheduleIdsJson : [];
    if (ids.length && isDoAgent(def.agent)) {
      const stub = await schedulerFor(c.env, def.agent);
      await stub.cancelGsuiteTask(ids);
    }
    await db.delete(scheduledTasks).where(eq(scheduledTasks.id, id));
    return c.json({ data: { deleted: true, id } } as { data: any }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /api/agent-tasks/:id/events — run-event feed (kept)
// ---------------------------------------------------------------------------

agentTasksRouter.openapi(
  createRoute({
    method: "get",
    path: "/:id/events",
    tags: ["Tasks"],
    summary: "List run events for a task",
    operationId: "agentTasksListEvents",
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      200: { description: "Events", content: { "application/json": { schema: z.object({ data: z.array(AnySchema) }) } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const rows = await db.select().from(taskEvents).where(eq(taskEvents.taskId, id));
    return c.json({ data: rows } as { data: any[] }, 200);
  },
);

// Re-export schemas for use by other modules.
export { selectScheduledTaskSchema, selectTaskEventSchema };
