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
 * This Worker has zero Durable Object bindings. MCP (`/mcp`) and Google OAuth
 * (`/auth/google*`) are wired directly in `src/_worker.ts`, outside this Hono
 * app. Route mount order: auth → health → config → admin → docs → client-error.
 */

import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { agentAuthMiddleware } from "./middleware/agent-auth";
import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { authRouter } from "./routes/auth";
import { clientErrorRouter } from "./routes/client-error";
import { adminRouter, configRouter } from "./routes/config";
import { docsRouter } from "./routes/docs";
import { gmailRouter } from "./routes/gmail";
import { healthRouter } from "./routes/health";
import { activityRouter } from "./routes/activity";
import { circuitRouter } from "./routes/circuit";
import { dashboardRouter } from "./routes/dashboard";
import { gwsRouter } from "./routes/gws";
import { gwsNotificationsRouter } from "./routes/gws-notifications";
import { gwsTemplatesRouter } from "./routes/gws-templates";
import { driveWebhookRouter } from "./routes/drive-webhook";
import { projectsRouter } from "./routes/projects";
import { seedRouter } from "./routes/seed";
import { settingsRouter } from "./routes/settings";
import { taskDetailRouter } from "./routes/task-detail";
import { taskHierarchyRouter } from "./routes/task-hierarchy";
import { tasksRouter } from "./routes/tasks";
import { teamNotesRouter } from "./routes/team-notes";
import { threadsRouter } from "./routes/gsuite/threads";
import { catalogRouter } from "./routes/gsuite/catalog";
import { agentTasksRouter } from "./routes/gsuite/agent-tasks";
import { accountsRouter } from "./routes/gsuite/accounts";
import { authGoogleOauthRouter } from "./routes/gsuite/auth-google-oauth";
import { agentSessionRouter } from "./routes/gsuite/agent-session";
import { gsuiteHealthRouter } from "./routes/gsuite/gsuite-health";

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
// Billing circuit breaker control (`GET/POST /api/admin/circuit*`) — mounted
// BEFORE the blanket `/api/admin/*` cookie gate below so its own middleware
// (cookie OR Bearer WORKER_API_KEY, see routes/circuit.ts) runs first. Hono
// composes matched layers in registration order, so this earlier-registered
// router's own auth + handler resolve the request before the later cookie
// gate is ever reached. This is deliberately the mirror image of the
// gsuite-surfaces pattern below (middleware registered before its router) —
// here the router carries its own auth precisely so a kill switch survives a
// session outage.
app.route("/api/admin/circuit", circuitRouter);

app.use("/api/admin/*", authMiddleware);

// Ported gsuite surfaces (see C1 in the 2026-07-25 security audit): these
// read chat/thread state, drive Google Workspace actions, and revoke OAuth
// credentials, so they require the same credential as the `/agents/*`
// Durable Object gate. `/api/auth/google/oauth/*` stays exempt (pre-auth
// consent flow) and `/api/agent-session/*` stays exempt (it self-validates —
// it's how a client becomes authenticated in the first place).
// Gate BOTH the base path and sub-paths — Hono's `/x/*` matches `/x/y` but not
// the bare `/x`, so the collection endpoints (e.g. GET /api/threads) need an
// explicit base-path guard too, or they'd stay wide open.
for (const base of ["/api/threads", "/api/catalog", "/api/agent-tasks", "/api/accounts", "/api/gsuite-health"]) {
  app.use(base, agentAuthMiddleware);
  app.use(`${base}/*`, agentAuthMiddleware);
}

// ---------------------------------------------------------------------------
// Domain routers
// ---------------------------------------------------------------------------

app.route("/api/auth", authRouter);
app.route("/api/health", healthRouter);
app.route("/api/config", configRouter);
app.route("/api/admin", adminRouter);
app.route("/api/docs", docsRouter);

// Feature APIs (open — see auth note above)
app.route("/api/gmail", gmailRouter);
app.route("/api/projects", projectsRouter);
app.route("/api/tasks", tasksRouter);
// Comments / Subtasks / Attachments for a single task — mounted alongside
// tasksRouter under the same base; its paths are all `/{id}/…` sub-resources.
app.route("/api/tasks", taskDetailRouter);
// Parent/child (subtask) navigation — GET /{id}/children, GET /{id}/ancestors.
app.route("/api/tasks", taskHierarchyRouter);
app.route("/api/team-notes", teamNotesRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/activity", activityRouter);
app.route("/api/dashboard", dashboardRouter);
app.route("/api/gws", gwsRouter);
app.route("/api/gws/notifications", gwsNotificationsRouter);
app.route("/api/gws/templates", gwsTemplatesRouter);
app.route("/api/gws/drive-webhook", driveWebhookRouter);
app.route("/api/seed", seedRouter);

// Ported chat/tasks-scheduler surfaces (core-gsuite-tools Phase 3). Open —
// same "feature APIs" convention as above — except the OAuth consent routes,
// which are inherently pre-auth.
app.route("/api/threads", threadsRouter);
app.route("/api/catalog", catalogRouter);
// Distinct prefix from the existing project-management `/api/tasks`: this is
// the Workspace-automation scheduled-task domain ported from core-gsuite-tools.
app.route("/api/agent-tasks", agentTasksRouter);
app.route("/api/accounts", accountsRouter);
app.route("/api/auth/google/oauth", authGoogleOauthRouter);
// Distinct prefix from the existing `/api/auth` (cr_session admin login):
// mints the gsuite_session cookie the /agents/* Durable Object gate accepts.
app.route("/api/agent-session", agentSessionRouter);
// Distinct prefix from the existing `/api/health` (different response shape).
app.route("/api/gsuite-health", gsuiteHealthRouter);

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
