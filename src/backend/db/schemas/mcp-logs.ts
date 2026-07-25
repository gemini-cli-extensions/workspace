import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

export const MCP_LOGS_TABLE_DESCRIPTION =
  "Request/response log for MCP (Model Context Protocol) tool invocations. Populated by health checks and runtime telemetry to power latency dashboards and failure forensics.";

export const MCP_LOGS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Unique log entry identifier (UUID v4).",
  server_name: "MCP server identifier (e.g. cloudflare-docs, internal-broker).",
  tool_name: "Name of the invoked tool / method.",
  request: "JSON payload sent to the MCP tool (sanitized).",
  response: "JSON payload returned by the MCP tool (sanitized).",
  success: "1 if the call resolved without error, 0 if it failed or timed out.",
  error_message: "Captured error string when success = 0.",
  latency_ms: "End-to-end wall-clock latency in milliseconds.",
  created_at: "Unix timestamp (seconds) when the call completed.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const mcpLogs = sqliteTable("mcp_logs", {
  id: text("id").primaryKey(),
  serverName: text("server_name").notNull(),
  toolName: text("tool_name").notNull(),
  request: text("request", { mode: "json" }).$type<Record<string, unknown>>(),
  response: text("response", { mode: "json" }).$type<Record<string, unknown>>(),
  success: integer("success", { mode: "boolean" }).notNull().default(false),
  errorMessage: text("error_message"),
  latencyMs: integer("latency_ms").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Zod schemas & types
// ---------------------------------------------------------------------------

export const insertMcpLogSchema = createInsertSchema(mcpLogs);
export const selectMcpLogSchema = createSelectSchema(mcpLogs);
export type McpLogRow = typeof mcpLogs.$inferSelect;
export type NewMcpLogRow = typeof mcpLogs.$inferInsert;
