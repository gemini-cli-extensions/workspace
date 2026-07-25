/**
 * @fileoverview Hono API application — the central REST API for the template
 * Worker.
 *
 * This module creates the root `OpenAPIHono` app, registers global middleware
 * (CORS, logger, error handler, session-cookie auth), and mounts the generic
 * template routers under `/api/*`. It also exposes OpenAPI documentation at:
 *   - `/openapi.json` — machine-readable OpenAPI 3.1 spec
 *   - `/scalar`       — interactive Scalar API reference UI
 *   - `/swagger`      — Swagger UI
 *
 * The chat / agent surfaces are NOT served here — they run on Durable Objects
 * via the Agents SDK (`routeAgentRequest`) and are wired in `src/_worker.ts`.
 * Route mount order: auth → health → config → admin → docs → client-error.
 */

import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { authRouter } from "./routes/auth";
import { clientErrorRouter } from "./routes/client-error";
import { adminRouter, configRouter } from "./routes/config";
import { docsRouter } from "./routes/docs";
import { healthRouter } from "./routes/health";
import { inboxRouter } from "./routes/inbox";
import { activityRouter } from "./routes/activity";
import { dashboardRouter } from "./routes/dashboard";
import { notificationsRouter } from "./routes/notifications";
import { projectsRouter } from "./routes/projects";
import { seedRouter } from "./routes/seed";
import { settingsRouter } from "./routes/settings";
import { taskDetailRouter } from "./routes/task-detail";
import { taskHierarchyRouter } from "./routes/task-hierarchy";
import { tasksRouter } from "./routes/tasks";
import { teamNotesRouter } from "./routes/team-notes";
import { threadsRouter } from "./routes/threads";
import { webhooksRouter } from "./routes/webhooks";

// ---------------------------------------------------------------------------
// App type — shared by all routers
// ---------------------------------------------------------------------------

/** Request-scoped variables set by middleware (e.g. `authed` after auth). */
export type Variables = { authed: boolean };

/**
 * Hono binding types used across the API layer.
 *
 * - `Bindings` — Cloudflare Worker `Env` (D1, KV, Secrets Store, AI, etc.)
 * - `Variables` — request-scoped variables set by middleware (e.g. `authed`)
 */
export type AppBindings = {
  Bindings: Env;
  Variables: Variables;
};

// ---------------------------------------------------------------------------
// Root app and global middleware
// ---------------------------------------------------------------------------

/** Root Hono OpenAPI app instance. */
export const app = new OpenAPIHono<AppBindings>();

/** Enable CORS for all origins (single-user template default). */
app.use("*", cors());
/** Log every request method + path + status + duration. */
app.use("*", logger());
/** Global error handler — returns structured JSON errors. */
app.onError(errorHandler);

// ---------------------------------------------------------------------------
// Public route (no auth required)
// ---------------------------------------------------------------------------

/** Lightweight liveness probe — returns `{ status: "ok", timestamp }`. */
app.get("/api/ping", (c) => c.json({ status: "ok", timestamp: Date.now() }));

/**
 * Public OpenAPI documentation aliases under `/api/*`.
 *
 * These mirror the root-mounted `/openapi.json`, `/swagger`, `/scalar`
 * endpoints so external consumers that expect the docs to live under the
 * API prefix can discover them. Registered before the auth middleware so
 * they remain publicly reachable.
 */
app.doc("/api/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "CFW Astro shadcn Agents Template",
    version: "1.0.0",
  },
});
app.get("/api/scalar", apiReference({ url: "/api/openapi.json" }));
app.get("/api/swagger", swaggerUI({ url: "/api/openapi.json" }));

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
//
// Only the admin surface is gated behind the signed session cookie. The
// showcase feature APIs (projects, tasks, stats, settings, notifications,
// dashboard) are intentionally open so the template runs end-to-end out of the
// box. Tighten this to `/api/*` once you wire real per-user auth.
app.use("/api/admin/*", authMiddleware);

// ---------------------------------------------------------------------------
// Domain routers
// ---------------------------------------------------------------------------

app.route("/api/auth", authRouter);
app.route("/api/health", healthRouter);
app.route("/api/config", configRouter);
app.route("/api/admin", adminRouter);
app.route("/api/docs", docsRouter);

// Feature APIs (open — see auth note above)
app.route("/api/projects", projectsRouter);
app.route("/api/tasks", tasksRouter);
// Comments / Subtasks / Attachments for a single task — mounted alongside
// tasksRouter under the same base; its paths are all `/{id}/…` sub-resources.
app.route("/api/tasks", taskDetailRouter);
// Parent/child (subtask) navigation — GET /{id}/children, GET /{id}/ancestors.
app.route("/api/tasks", taskHierarchyRouter);
app.route("/api/team-notes", teamNotesRouter);
app.route("/api/threads", threadsRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/webhooks", webhooksRouter);
app.route("/api/activity", activityRouter);
app.route("/api/notifications", notificationsRouter);
app.route("/api/dashboard", dashboardRouter);
app.route("/api/inbox", inboxRouter);
app.route("/api/seed", seedRouter);

app.route("/api/__client-error", clientErrorRouter);

// ---------------------------------------------------------------------------
// OpenAPI documentation endpoints
// ---------------------------------------------------------------------------

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "CFW Astro shadcn Agents Template",
    version: "1.0.0",
  },
});
app.get("/scalar", apiReference({ url: "/openapi.json" }));
app.get("/swagger", swaggerUI({ url: "/openapi.json" }));
