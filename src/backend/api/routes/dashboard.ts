/**
 * @fileoverview Dashboard REST API router.
 *
 * Aggregates data from D1 for admin-dashboard stat cards, chart datasets, and
 * an AI-generated insight paragraph. All aggregations run directly on D1 using
 * Drizzle ORM; no external caches are required.
 *
 * Mount this router at `/api/dashboard` in `api/index.ts`.
 *
 * Route inventory:
 *   GET /stats    – stat cards (total/active projects, tasks counts, completion %, overdue, unread)
 *   GET /charts   – multiple chart datasets (pie, bar, line/area)
 *   GET /insights – Workers AI markdown insight over the aggregated dashboard data
 *
 * All three routes accept `?range=7d|30d|90d` where applicable.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { generateText } from "ai";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import { getChatModel } from "../../ai/providers/ai-sdk";
import { getDb } from "../../db";
import { metricsDaily, notifications, projects, tasks } from "../../db/schema";

// ---------------------------------------------------------------------------
// Range helpers
// ---------------------------------------------------------------------------

/** Resolve the `?range` query param into a JS Date cutoff. */
function rangeStart(range: string | undefined): Date {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30; // default 30d
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const rangeQuery = z.object({
  range: z
    .enum(["7d", "30d", "90d"])
    .optional()
    .openapi({ description: "Time window for time-series and overdue calculations (default 30d)." }),
});

// ---------------------------------------------------------------------------
// Stat cards schema
// ---------------------------------------------------------------------------

const statsResponseSchema = z.object({
  totalProjects: z.number(),
  activeProjects: z.number(),
  totalTasks: z.number(),
  completedTasks: z.number(),
  completionRatePct: z.number().openapi({ description: "Completed / total * 100, rounded to 1 dp." }),
  overdueTasks: z.number().openapi({ description: "Tasks where dueDate < now AND status != done." }),
  unreadNotifications: z.number(),
});

// ---------------------------------------------------------------------------
// Chart datasets schema
// ---------------------------------------------------------------------------

const nameValueSchema = z.object({ name: z.string(), value: z.number() });

const tasksOverTimePointSchema = z.object({
  date: z.string().openapi({ description: "YYYY-MM-DD." }),
  created: z.number(),
  completed: z.number(),
});

const throughputPointSchema = z.object({
  date: z.string(),
  value: z.number(),
});

const chartsResponseSchema = z.object({
  tasksByStatus: z.array(nameValueSchema).openapi({ description: "For a pie/donut chart." }),
  tasksByPriority: z.array(nameValueSchema).openapi({ description: "For a bar chart." }),
  tasksOverTime: z
    .array(tasksOverTimePointSchema)
    .openapi({ description: "For a line/area chart." }),
  projectsByStatus: z.array(nameValueSchema).openapi({ description: "For a bar/pie chart." }),
  throughput: z
    .array(throughputPointSchema)
    .openapi({ description: "Completed tasks per day for a bar chart." }),
});

// ---------------------------------------------------------------------------
// Insights schema
// ---------------------------------------------------------------------------

const insightsResponseSchema = z.object({
  insight: z.string().openapi({ description: "2–4 bullet markdown insight string." }),
  generatedAt: z.string().openapi({ description: "ISO 8601 timestamp." }),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const dashboardRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /stats
// ---------------------------------------------------------------------------

dashboardRouter.openapi(
  createRoute({
    method: "get",
    path: "/stats",
    tags: ["Dashboard"],
    summary: "Stat cards — projects, tasks, completion rate, overdue, unread",
    operationId: "dashboardStats",
    request: { query: rangeQuery },
    responses: {
      200: {
        description: "Aggregated stat card values.",
        content: { "application/json": { schema: statsResponseSchema } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const now = new Date();

    const [projectCounts, taskCounts, overdueCounts, unreadCounts] = await Promise.all([
      // Project aggregates
      db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`sum(case when ${projects.status} = 'active' then 1 else 0 end)`,
        })
        .from(projects),

      // Task aggregates
      db
        .select({
          total: sql<number>`count(*)`,
          completed: sql<number>`sum(case when ${tasks.status} = 'done' then 1 else 0 end)`,
        })
        .from(tasks),

      // Overdue: dueDate < now AND status != done
      db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(and(lte(tasks.dueDate, now), sql`${tasks.status} != 'done'`)),

      // Unread notifications
      db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(eq(notifications.read, false)),
    ]);

    const totalProjects = projectCounts[0]?.total ?? 0;
    const activeProjects = projectCounts[0]?.active ?? 0;
    const totalTasks = taskCounts[0]?.total ?? 0;
    const completedTasks = taskCounts[0]?.completed ?? 0;
    const completionRatePct =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 1000) / 10 : 0;

    return c.json(
      {
        totalProjects,
        activeProjects,
        totalTasks,
        completedTasks,
        completionRatePct,
        overdueTasks: overdueCounts[0]?.count ?? 0,
        unreadNotifications: unreadCounts[0]?.count ?? 0,
      },
      200,
    );
  },
);

// ---------------------------------------------------------------------------
// GET /charts
// ---------------------------------------------------------------------------

dashboardRouter.openapi(
  createRoute({
    method: "get",
    path: "/charts",
    tags: ["Dashboard"],
    summary: "Chart datasets — status pie, priority bar, time-series, project breakdown, throughput",
    operationId: "dashboardCharts",
    request: { query: rangeQuery },
    responses: {
      200: {
        description: "Multiple chart-ready datasets.",
        content: { "application/json": { schema: chartsResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { range } = c.req.valid("query");
    const db = getDb(c.env);
    const since = rangeStart(range);

    const [statusRows, priorityRows, projectStatusRows, metricsRows, recentTasks] =
      await Promise.all([
        // Tasks by status
        db
          .select({ status: tasks.status, count: sql<number>`count(*)` })
          .from(tasks)
          .groupBy(tasks.status),

        // Tasks by priority
        db
          .select({ priority: tasks.priority, count: sql<number>`count(*)` })
          .from(tasks)
          .groupBy(tasks.priority),

        // Projects by status
        db
          .select({ status: projects.status, count: sql<number>`count(*)` })
          .from(projects)
          .groupBy(projects.status),

        // metrics_daily rows for tasksOverTime + throughput (may be empty)
        db
          .select()
          .from(metricsDaily)
          .where(gte(metricsDaily.createdAt, since))
          .orderBy(metricsDaily.date),

        // Recent tasks for derived time-series fallback
        db
          .select({
            id: tasks.id,
            status: tasks.status,
            createdAt: tasks.createdAt,
            updatedAt: tasks.updatedAt,
          })
          .from(tasks)
          .where(gte(tasks.createdAt, since))
          .orderBy(tasks.createdAt),
      ]);

    // --- tasksByStatus -------------------------------------------------------
    const STATUS_LABELS: Record<string, string> = {
      todo: "To Do",
      in_progress: "In Progress",
      in_review: "In Review",
      done: "Done",
    };
    const tasksByStatus = statusRows.map((r) => ({
      name: STATUS_LABELS[r.status] ?? r.status,
      value: r.count,
    }));

    // --- tasksByPriority -----------------------------------------------------
    const PRIORITY_LABELS: Record<string, string> = {
      low: "Low",
      medium: "Medium",
      high: "High",
      urgent: "Urgent",
    };
    const tasksByPriority = priorityRows.map((r) => ({
      name: PRIORITY_LABELS[r.priority] ?? r.priority,
      value: r.count,
    }));

    // --- projectsByStatus ----------------------------------------------------
    const PROJECT_LABELS: Record<string, string> = {
      active: "Active",
      archived: "Archived",
      on_hold: "On Hold",
    };
    const projectsByStatus = projectStatusRows.map((r) => ({
      name: PROJECT_LABELS[r.status] ?? r.status,
      value: r.count,
    }));

    // --- tasksOverTime & throughput ------------------------------------------
    // Prefer metrics_daily if populated; fall back to computing from tasks.
    let tasksOverTime: { date: string; created: number; completed: number }[] = [];
    let throughput: { date: string; value: number }[] = [];

    const createdMetrics = metricsRows.filter((r) => r.metric === "tasks_created");
    const completedMetrics = metricsRows.filter((r) => r.metric === "tasks_completed");

    if (createdMetrics.length > 0 || completedMetrics.length > 0) {
      // Use metrics_daily as the source of truth
      const allDates = new Set([
        ...createdMetrics.map((r) => r.date),
        ...completedMetrics.map((r) => r.date),
      ]);
      for (const date of [...allDates].sort()) {
        const created = createdMetrics.find((r) => r.date === date)?.value ?? 0;
        const completed = completedMetrics.find((r) => r.date === date)?.value ?? 0;
        tasksOverTime.push({ date, created, completed });
        throughput.push({ date, value: completed });
      }
    } else {
      // Derive from task createdAt / updatedAt grouped by calendar day (UTC)
      const createdByDay = new Map<string, number>();
      const completedByDay = new Map<string, number>();

      for (const task of recentTasks) {
        const createdDay = task.createdAt.toISOString().slice(0, 10);
        createdByDay.set(createdDay, (createdByDay.get(createdDay) ?? 0) + 1);
        if (task.status === "done") {
          const completedDay = task.updatedAt.toISOString().slice(0, 10);
          completedByDay.set(completedDay, (completedByDay.get(completedDay) ?? 0) + 1);
        }
      }

      const allDays = new Set([...createdByDay.keys(), ...completedByDay.keys()]);
      for (const date of [...allDays].sort()) {
        const created = createdByDay.get(date) ?? 0;
        const completed = completedByDay.get(date) ?? 0;
        tasksOverTime.push({ date, created, completed });
        throughput.push({ date, value: completed });
      }
    }

    return c.json(
      { tasksByStatus, tasksByPriority, tasksOverTime, projectsByStatus, throughput },
      200,
    );
  },
);

// ---------------------------------------------------------------------------
// GET /insights
// ---------------------------------------------------------------------------

dashboardRouter.openapi(
  createRoute({
    method: "get",
    path: "/insights",
    tags: ["Dashboard"],
    summary: "Workers AI insight — 2-4 bullet markdown analysis of current dashboard data",
    operationId: "dashboardInsights",
    request: { query: rangeQuery },
    responses: {
      200: {
        description: "AI-generated markdown insight string.",
        content: { "application/json": { schema: insightsResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { range } = c.req.valid("query");
    const db = getDb(c.env);
    const now = new Date();
    const generatedAt = now.toISOString();
    const rangeLabel = range ?? "30d";
    const since = rangeStart(range);

    // --- Gather aggregates ------------------------------------------------
    const [projectAgg, taskAgg, overdueAgg, unreadAgg, recentTasks] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`sum(case when ${projects.status}='active' then 1 else 0 end)`,
        })
        .from(projects),
      db
        .select({
          total: sql<number>`count(*)`,
          completed: sql<number>`sum(case when ${tasks.status}='done' then 1 else 0 end)`,
          inProgress: sql<number>`sum(case when ${tasks.status}='in_progress' then 1 else 0 end)`,
          todo: sql<number>`sum(case when ${tasks.status}='todo' then 1 else 0 end)`,
        })
        .from(tasks),
      db
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(and(lte(tasks.dueDate, now), sql`${tasks.status} != 'done'`)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(eq(notifications.read, false)),
      db
        .select({ status: tasks.status, createdAt: tasks.createdAt })
        .from(tasks)
        .where(gte(tasks.createdAt, since))
        .orderBy(desc(tasks.createdAt))
        .limit(200),
    ]);

    const totalProjects = projectAgg[0]?.total ?? 0;
    const activeProjects = projectAgg[0]?.active ?? 0;
    const totalTasks = taskAgg[0]?.total ?? 0;
    const completedTasks = taskAgg[0]?.completed ?? 0;
    const inProgressTasks = taskAgg[0]?.inProgress ?? 0;
    const todoTasks = taskAgg[0]?.todo ?? 0;
    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const overdueTasks = overdueAgg[0]?.count ?? 0;
    const unreadNotifications = unreadAgg[0]?.count ?? 0;
    const recentCreated = recentTasks.length;
    const recentCompleted = recentTasks.filter((t) => t.status === "done").length;

    // --- Build prompt (real newlines — NOT .join('\n')) --------------------
    const prompt = `You are a project management analyst. Given the following dashboard metrics for the last ${rangeLabel}, produce exactly 2–4 concise bullet points (markdown, using "- " prefix) highlighting trends, risks, and recommendations. Do NOT repeat the numbers verbatim — interpret them.

Dashboard metrics (${rangeLabel} window):
- Total projects: ${totalProjects} (${activeProjects} active)
- Total tasks: ${totalTasks} | Completed: ${completedTasks} | In Progress: ${inProgressTasks} | To Do: ${todoTasks}
- Completion rate: ${completionRate}%
- Overdue tasks: ${overdueTasks}
- Unread notifications: ${unreadNotifications}
- Tasks created in window: ${recentCreated}
- Tasks completed in window: ${recentCompleted}

Respond with only the bullet list. No preamble, no headings.`;

    // --- Call Workers AI --------------------------------------------------
    let insight: string;
    try {
      const model = getChatModel(c.env);
      const result = await generateText({
        model,
        prompt,
        maxOutputTokens: 400,
      });
      insight = result.text.trim();
      if (!insight) throw new Error("empty response");
    } catch (aiErr) {
      console.error(
        JSON.stringify({ level: "WARN", route: "dashboardInsights", aiError: String(aiErr) }),
      );
      // Graceful fallback — synthesize a bullet list from the raw numbers
      insight = `- Completion rate is ${completionRate}% across ${totalTasks} tasks.
- ${overdueTasks > 0 ? `${overdueTasks} task${overdueTasks !== 1 ? "s are" : " is"} currently overdue — review priorities.` : "No overdue tasks detected."}
- ${activeProjects} of ${totalProjects} project${totalProjects !== 1 ? "s are" : " is"} active.
- ${unreadNotifications > 0 ? `${unreadNotifications} unread notification${unreadNotifications !== 1 ? "s" : ""} pending review.` : "Notification inbox is clear."}`;
    }

    return c.json({ insight, generatedAt }, 200);
  },
);
