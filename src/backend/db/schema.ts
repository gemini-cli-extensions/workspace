/**
 * @fileoverview Drizzle schema barrel — single source of truth for the
 * template's D1 tables.
 *
 * Generic infrastructure tables (config, health, dashboard metrics, agent
 * human-in-the-loop proposals, MCP request logs, job-failure logging) are
 * exported first, followed by domain tables (projects, tasks, stats,
 * settings, notifications). Add new domain tables under
 * `./schemas/<domain>/` and re-export them here.
 */

// ---------------------------------------------------------------------------
// Infrastructure / generic tables
// ---------------------------------------------------------------------------
export * from "./schemas/global-config";
export * from "./schemas/job-failures";

export * from "./schemas/health";
export * from "./schemas/health-checks";

export * from "./schemas/best-practices";
export * from "./schemas/hitl-proposals";
export * from "./schemas/mcp-logs";

export * from "./schemas/dashboard-metrics";

// ---------------------------------------------------------------------------
// Domain tables
// ---------------------------------------------------------------------------
export * from "./schemas/projects";
export * from "./schemas/tasks";
export * from "./schemas/stats";
export * from "./schemas/settings";
export * from "./schemas/notifications";
export * from "./schemas/inbox";
export * from "./schemas/chat";
