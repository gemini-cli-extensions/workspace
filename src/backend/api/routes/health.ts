/**
 * @fileoverview Health check API routes for the Career Orchestrator Worker.
 *
 * Provides three endpoints:
 *  - `GET  /api/health`        — Quick liveness check (returns latest run from D1)
 *  - `GET  /api/health/latest` — Fetch the most recent run with all results
 *  - `POST /api/health/run`    — Run a full diagnostic, persist to D1, return results
 *
 * Uses the relational D1 schema (`health_runs` + `health_results`). The
 * `runAllChecks` path iterates every registered Durable Object agent binding,
 * opens a stub, calls a no-op `ping` RPC, and records latency per agent.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";

import { healthRuns, healthResults } from "@db/schemas";
import { getDb } from "@/db";

// ---------------------------------------------------------------------------
// HealthCoordinator
// ---------------------------------------------------------------------------

type DOBindingDescriptor = {
  /** Hono binding key on `Env`. */
  binding: keyof Env;
  /** Friendly check name persisted to `health_results.name`. */
  name: string;
};

/**
 * Canonical list of Durable Object agent bindings the coordinator pings.
 *
 * Each entry is opened via `env[binding].idFromName("health-probe")`, a stub
 * is fetched, and a no-op HTTP request to `/__ping` is sent. Failures and
 * timeouts are caught and recorded — they do not abort the run.
 */
const AGENT_BINDINGS: DOBindingDescriptor[] = [
  { binding: "CODE_MODE_AGENT" as keyof Env, name: "code_mode_agent_ping" },
  { binding: "BROWSER_HITL_AGENT" as keyof Env, name: "browser_hitl_agent_ping" },
  { binding: "WORKFLOWS_AGENT" as keyof Env, name: "workflows_agent_ping" },
  { binding: "ARTIFACT_AGENT" as keyof Env, name: "artifact_agent_ping" },
  { binding: "CHAT_BROKER" as keyof Env, name: "chat_broker_ping" },
  { binding: "NOTIFICATIONS_AGENT" as keyof Env, name: "notifications_agent_ping" },
];

const PING_TIMEOUT_MS = 2000;

type CheckResult = {
  category: "database" | "ai" | "agents" | "binding";
  name: string;
  status: "ok" | "warn" | "fail" | "skipped" | "timeout";
  message?: string;
  details?: Record<string, unknown>;
  durationMs: number;
};

class HealthCoordinator {
  constructor(private readonly env: Env) {}

  // -----------------------------------------------------------------------
  // GET helpers
  // -----------------------------------------------------------------------

  async getLatestRun() {
    const db = getDb(this.env);
    const [latest] = await db
      .select()
      .from(healthRuns)
      .orderBy(desc(healthRuns.createdAt))
      .limit(1);

    if (!latest) return { run: null, results: [] as Array<typeof healthResults.$inferSelect> };

    const results = await db
      .select()
      .from(healthResults)
      .where(eq(healthResults.runId, latest.id));

    return { run: latest, results };
  }

  // -----------------------------------------------------------------------
  // Run all checks
  // -----------------------------------------------------------------------

  async runAllChecks(trigger: "manual" | "scheduled" | "agent") {
    const start = Date.now();

    const checks = await Promise.all([
      this.checkD1(),
      this.checkWorkersAI(),
      ...AGENT_BINDINGS.map((descriptor) => this.pingAgent(descriptor)),
    ]);

    const durationMs = Date.now() - start;
    const status = aggregateStatus(checks);

    const runId = crypto.randomUUID();
    const db = getDb(this.env);

    await db.insert(healthRuns).values({
      id: runId,
      status,
      trigger,
      durationMs,
      metadata: { checkCount: checks.length },
    });

    if (checks.length > 0) {
      await db.insert(healthResults).values(
        checks.map((c) => ({
          id: crypto.randomUUID(),
          runId,
          category: c.category,
          name: c.name,
          status: c.status,
          message: c.message,
          details: c.details,
          durationMs: c.durationMs,
        })),
      );
    }

    return this.getRunById(runId);
  }

  // -----------------------------------------------------------------------
  // Individual checks
  // -----------------------------------------------------------------------

  private async checkD1(): Promise<CheckResult> {
    const start = Date.now();
    try {
      const result = await this.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      return {
        category: "database",
        name: "d1_roundtrip",
        status: result?.ok === 1 ? "ok" : "warn",
        message: result?.ok === 1 ? "D1 responded with SELECT 1" : "Unexpected D1 response",
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        category: "database",
        name: "d1_roundtrip",
        status: "fail",
        message: error instanceof Error ? error.message : "Unknown D1 failure",
        durationMs: Date.now() - start,
      };
    }
  }

  private async checkWorkersAI(): Promise<CheckResult> {
    const start = Date.now();
    try {
      const binding = (this.env as unknown as { AI?: unknown }).AI;
      if (!binding) {
        return {
          category: "ai",
          name: "workers_ai_binding",
          status: "skipped",
          message: "env.AI binding not present",
          durationMs: Date.now() - start,
        };
      }
      return {
        category: "ai",
        name: "workers_ai_binding",
        status: "ok",
        message: "env.AI binding available",
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        category: "ai",
        name: "workers_ai_binding",
        status: "fail",
        message: error instanceof Error ? error.message : "Unknown AI binding failure",
        durationMs: Date.now() - start,
      };
    }
  }

  private async pingAgent(descriptor: DOBindingDescriptor): Promise<CheckResult> {
    const start = Date.now();
    const ns = (this.env as unknown as Record<string, unknown>)[descriptor.binding as string] as
      | DurableObjectNamespace
      | undefined;

    if (!ns || typeof ns.idFromName !== "function") {
      return {
        category: "binding",
        name: descriptor.name,
        status: "skipped",
        message: `Binding ${String(descriptor.binding)} is not present on env`,
        durationMs: Date.now() - start,
      };
    }

    try {
      const id = ns.idFromName("health-probe");
      const stub = ns.get(id);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

      const response = await stub.fetch("https://do.local/__ping", {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timer);

      const durationMs = Date.now() - start;
      // 404 is fine — it confirms the DO is reachable even if no /__ping route exists.
      const reachable = response.status < 500;
      return {
        category: "agents",
        name: descriptor.name,
        status: reachable ? "ok" : "fail",
        message: `${descriptor.binding as string} responded ${response.status}`,
        details: { status: response.status },
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - start;
      const aborted = error instanceof Error && error.name === "AbortError";
      return {
        category: "agents",
        name: descriptor.name,
        status: aborted ? "timeout" : "fail",
        message: error instanceof Error ? error.message : "Unknown DO failure",
        durationMs,
      };
    }
  }

  private async getRunById(runId: string) {
    const db = getDb(this.env);
    const [run] = await db.select().from(healthRuns).where(eq(healthRuns.id, runId)).limit(1);
    const results = await db
      .select()
      .from(healthResults)
      .where(eq(healthResults.runId, runId));
    return { run, results };
  }
}

function aggregateStatus(checks: CheckResult[]): "healthy" | "degraded" | "unhealthy" | "unknown" {
  if (checks.length === 0) return "unknown";
  const fails = checks.filter((c) => c.status === "fail" || c.status === "timeout").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  if (fails > 0) return "unhealthy";
  if (warns > 0) return "degraded";
  return "healthy";
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const checkStatusEnum = z.enum(["ok", "warn", "fail", "skipped", "timeout"]);
const healthStatusEnum = z.enum(["healthy", "degraded", "unhealthy", "unknown"]);
const triggerEnum = z.enum(["manual", "scheduled", "agent"]);
const categoryEnum = z.enum([
  "database",
  "ai",
  "providers",
  "agents",
  "google",
  "binding",
  "auth",
  "api",
  "custom",
]);

const healthResultSchema = z.object({
  id: z.string(),
  runId: z.string(),
  category: categoryEnum,
  name: z.string(),
  status: checkStatusEnum,
  message: z.string().nullish(),
  details: z.record(z.string(), z.unknown()).nullish(),
  durationMs: z.number(),
  aiSuggestion: z.string().nullish(),
  timestamp: z.union([z.string(), z.date()]),
});

const healthRunSchema = z.object({
  id: z.string(),
  status: healthStatusEnum,
  trigger: triggerEnum,
  durationMs: z.number(),
  createdAt: z.union([z.string(), z.date()]),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

const healthResponseSchema = z.object({
  run: healthRunSchema,
  results: z.array(healthResultSchema),
});

const latestResponseSchema = z.object({
  run: healthRunSchema.nullable(),
  results: z.array(healthResultSchema),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const healthRouter = new OpenAPIHono<{ Bindings: Env }>();

/**
 * GET /api/health — Quick liveness / latest run.
 *
 * Returns the latest persisted run from D1 without re-running checks.
 * If no run exists yet, returns { run: null, results: [] }.
 */
healthRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "healthCheck",
    responses: {
      200: {
        description: "Latest health run from D1 (no re-run)",
        content: { "application/json": { schema: latestResponseSchema } },
      },
    },
  }),
  async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const latest = await coordinator.getLatestRun();
    return c.json({ run: latest?.run ?? null, results: latest?.results ?? [] }, 200);
  },
);

/**
 * GET /api/health/latest — Same as GET / (explicit alias).
 */
healthRouter.openapi(
  createRoute({
    method: "get",
    path: "/latest",
    operationId: "getLatestHealthCheck",
    responses: {
      200: {
        description: "Most recent health run from D1",
        content: { "application/json": { schema: latestResponseSchema } },
      },
    },
  }),
  async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const latest = await coordinator.getLatestRun();
    return c.json({ run: latest?.run ?? null, results: latest?.results ?? [] }, 200);
  },
);

/**
 * POST /api/health/run — Explicit manual screening trigger.
 *
 * Runs all health checks (D1 roundtrip, Workers AI binding presence, every
 * registered agent DO ping) in parallel, persists run + results to D1, and
 * returns the full payload.
 */
healthRouter.openapi(
  createRoute({
    method: "post",
    path: "/run",
    operationId: "runHealthCheck",
    responses: {
      200: {
        description: "On-demand health diagnostic results",
        content: { "application/json": { schema: healthResponseSchema } },
      },
    },
  }),
  async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const { run, results } = await coordinator.runAllChecks("manual");
    return c.json({ run, results }, 200);
  },
);
