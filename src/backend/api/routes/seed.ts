/**
 * @fileoverview Demo-data seed route — makes the template a *real running app*
 * out of the box.
 *
 * `POST /api/seed` is idempotent: it only inserts sample data when the
 * `projects` table is empty, so it is safe to call repeatedly (e.g. from a
 * "Seed demo data" button or a first-run script). It populates projects, tasks
 * (spread across the last ~30 days so the dashboard time-series renders),
 * team notes, webhooks, an activity feed, and a handful of realtime
 * notifications (routed through the NotificationsAgent Durable Object).
 *
 * This is intentionally public for template convenience. For a production app,
 * move it behind `/api/admin/*` (auth-gated) or delete it.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAgentByName } from "agents";
import { sql } from "drizzle-orm";

import type { NotificationsAgent } from "@/backend/ai/agents/NotificationsAgent";
import { getDb } from "@/backend/db";
import { activityLog, projects, tasks, teamNotes, webhooks } from "@/backend/db/schema";

export const seedRouter = new OpenAPIHono<{ Bindings: Env }>();

/** Epoch ms for `daysAgo` days before now (optionally minus `hours`). */
function daysAgo(days: number, hours = 0): Date {
  return new Date(Date.now() - days * 86400000 - hours * 3600000);
}

const seedResponseSchema = z.object({
  seeded: z.boolean(),
  message: z.string(),
  counts: z
    .object({
      projects: z.number(),
      tasks: z.number(),
      notes: z.number(),
      webhooks: z.number(),
      activity: z.number(),
      notifications: z.number(),
    })
    .optional(),
});

seedRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    operationId: "seedDemoData",
    responses: {
      200: {
        description: "Seed result (idempotent — no-op if data already exists)",
        content: { "application/json": { schema: seedResponseSchema } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    // Idempotency guard — bail if there is already data.
    const existing = await db.select({ id: projects.id }).from(projects).limit(1);
    if (existing.length > 0) {
      return c.json({ seeded: false, message: "Demo data already present." });
    }

    // --- Projects -----------------------------------------------------------
    const projectRows = await db
      .insert(projects)
      .values([
        {
          name: "Edge Platform",
          slug: "edge-platform",
          description: "Core Workers + Durable Objects platform work.",
          status: "active",
          color: "#6366f1",
          starred: true,
        },
        {
          name: "Design System",
          slug: "design-system",
          description: "Monolith shadcn component library.",
          status: "active",
          color: "#06b6d4",
          starred: true,
        },
        {
          name: "Mobile App",
          slug: "mobile-app",
          description: "React Native client backed by the same API.",
          status: "on_hold",
          color: "#f59e0b",
        },
        {
          name: "Docs & DX",
          slug: "docs-dx",
          description: "Developer documentation and onboarding.",
          status: "active",
          color: "#10b981",
        },
      ])
      .returning({ id: projects.id, name: projects.name });

    const pid = (i: number) => projectRows[i]?.id ?? null;

    // --- Tasks (spread across statuses/priorities/time) ---------------------
    const taskSeed: {
      projectId: string | null;
      title: string;
      status: "todo" | "in_progress" | "in_review" | "done";
      priority: "low" | "medium" | "high" | "urgent";
      assignee: string;
      labels: string[];
      progress: number;
      created: Date;
      due: Date;
    }[] = [
      { projectId: pid(0), title: "Implement OAuth 2.0 authentication flow", status: "in_progress", priority: "high", assignee: "EM", labels: ["backend", "security"], progress: 60, created: daysAgo(12), due: daysAgo(-4) },
      { projectId: pid(0), title: "Add rate limiting to the API gateway", status: "todo", priority: "urgent", assignee: "SP", labels: ["backend"], progress: 0, created: daysAgo(3), due: daysAgo(-2) },
      { projectId: pid(0), title: "Durable Object hibernation tuning", status: "done", priority: "medium", assignee: "EM", labels: ["backend", "perf"], progress: 100, created: daysAgo(20), due: daysAgo(8) },
      { projectId: pid(1), title: "Build the chart component suite", status: "done", priority: "high", assignee: "D", labels: ["frontend", "design"], progress: 100, created: daysAgo(18), due: daysAgo(6) },
      { projectId: pid(1), title: "Dark-mode contrast audit", status: "in_review", priority: "medium", assignee: "D", labels: ["design", "a11y"], progress: 90, created: daysAgo(7), due: daysAgo(1) },
      { projectId: pid(1), title: "Document the no-borders rule", status: "todo", priority: "low", assignee: "SM", labels: ["docs", "design"], progress: 0, created: daysAgo(2), due: daysAgo(-9) },
      { projectId: pid(2), title: "Spike: offline sync strategy", status: "todo", priority: "medium", assignee: "SP", labels: ["mobile", "research"], progress: 0, created: daysAgo(5), due: daysAgo(-12) },
      { projectId: pid(2), title: "Push notification plumbing", status: "in_progress", priority: "high", assignee: "EM", labels: ["mobile", "backend"], progress: 35, created: daysAgo(9), due: daysAgo(-3) },
      { projectId: pid(3), title: "Write the getting-started guide", status: "in_progress", priority: "medium", assignee: "SM", labels: ["docs"], progress: 45, created: daysAgo(6), due: daysAgo(-5) },
      { projectId: pid(3), title: "Record the architecture walkthrough", status: "todo", priority: "low", assignee: "SM", labels: ["docs"], progress: 0, created: daysAgo(1), due: daysAgo(-14) },
      { projectId: pid(0), title: "Migrate D1 schema to folders", status: "done", priority: "medium", assignee: "EM", labels: ["backend", "db"], progress: 100, created: daysAgo(25), due: daysAgo(15) },
      { projectId: pid(1), title: "Add recharts donut center label", status: "done", priority: "low", assignee: "D", labels: ["frontend"], progress: 100, created: daysAgo(4), due: daysAgo(2) },
      { projectId: pid(0), title: "WebSocket reconnect backoff", status: "in_review", priority: "high", assignee: "SP", labels: ["backend", "realtime"], progress: 80, created: daysAgo(8), due: daysAgo(-1) },
      { projectId: pid(3), title: "Triage onboarding feedback", status: "todo", priority: "medium", assignee: "SM", labels: ["docs", "ux"], progress: 0, created: daysAgo(2), due: daysAgo(-7) },
    ];

    // D1 caps bound parameters at 100 per query; tasks has 13 columns, so
    // insert in chunks of 6 rows (78 params) to stay well under the limit.
    const taskValues = taskSeed.map((t, i) => ({
      projectId: t.projectId,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee,
      labels: t.labels,
      progress: t.progress,
      position: i,
      dueDate: t.due,
      createdAt: t.created,
      updatedAt: t.created,
    }));
    for (let i = 0; i < taskValues.length; i += 6) {
      await db.insert(tasks).values(taskValues.slice(i, i + 6));
    }

    // --- Team notes ---------------------------------------------------------
    await db.insert(teamNotes).values([
      { projectId: pid(0), title: "Auth decision log", body: "Going with signed cookies for the template; swap for JWT per-user in prod.", pinned: true },
      { projectId: pid(1), title: "Palette rationale", body: "Five-hue OKLCH chart palette chosen for high contrast on dark.", pinned: false },
      { projectId: pid(3), title: "Onboarding TODOs", body: "Cover the seed route + wrangler bindings in the quickstart.", pinned: false },
    ]);

    // --- Webhooks -----------------------------------------------------------
    await db.insert(webhooks).values([
      { name: "Deploy notifier", url: "https://example.com/hooks/deploy", events: ["project.created", "task.completed"], secret: crypto.randomUUID(), active: true },
      { name: "Slack bridge", url: "https://hooks.slack.com/services/XXX", events: ["task.created"], secret: crypto.randomUUID(), active: false },
    ]);

    // --- Activity feed ------------------------------------------------------
    await db.insert(activityLog).values([
      { actor: "EM", action: "created", entityType: "project", summary: "Created project “Edge Platform”", createdAt: daysAgo(25) },
      { actor: "D", action: "completed", entityType: "task", summary: "Completed “Build the chart component suite”", createdAt: daysAgo(6) },
      { actor: "SP", action: "updated", entityType: "task", summary: "Moved “WebSocket reconnect backoff” to In Review", createdAt: daysAgo(1) },
      { actor: "SM", action: "created", entityType: "note", summary: "Added a note to “Docs & DX”", createdAt: daysAgo(2) },
      { actor: "EM", action: "completed", entityType: "task", summary: "Completed “Migrate D1 schema to folders”", createdAt: daysAgo(15) },
    ]);

    // --- Notifications (through the realtime DO) -----------------------------
    let notificationCount = 0;
    try {
      const ns = c.env.NOTIFICATIONS_AGENT as unknown as DurableObjectNamespace<NotificationsAgent>;
      const stub = await getAgentByName(ns, "global");
      const seedNotifications = [
        { type: "success" as const, title: "Deploy succeeded", body: "Edge Platform shipped to production." },
        { type: "mention" as const, title: "You were mentioned", body: "SP mentioned you on “Add rate limiting”." },
        { type: "warning" as const, title: "Task overdue", body: "“Add rate limiting to the API gateway” is past due." },
        { type: "info" as const, title: "New teammate", body: "D joined the Design System project." },
      ];
      for (const n of seedNotifications) {
        await stub.add(n);
        notificationCount++;
      }
    } catch (err) {
      console.warn("Seed: notifications DO unavailable", err);
    }

    // Recompute denormalized task counts per project.
    await db.run(
      sql`UPDATE projects SET task_count = (SELECT COUNT(*) FROM tasks WHERE tasks.project_id = projects.id)`,
    );

    return c.json({
      seeded: true,
      message: "Seeded demo data.",
      counts: {
        projects: projectRows.length,
        tasks: taskSeed.length,
        notes: 3,
        webhooks: 2,
        activity: 5,
        notifications: notificationCount,
      },
    });
  },
);
