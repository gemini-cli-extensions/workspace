import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

export const HITL_PROPOSALS_TABLE_DESCRIPTION =
  "Human-in-the-loop action proposals submitted by agents (notably BrowserHitlAgent). Mirrors per-agent SQLite state into D1 for cross-agent dashboards and audit trails.";

export const HITL_PROPOSALS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Unique proposal identifier (UUID v4).",
  agent_id: "Originating agent class name (e.g. BrowserHitlAgent, WorkflowsAgent).",
  instance_name: "Agent instance name (Durable Object idFromName key).",
  action_type: "Categorical action: form_fill, navigation, click, file_write, external_call, custom.",
  payload: "JSON payload describing the requested action.",
  status: "Lifecycle: pending, approved, rejected, expired, executed.",
  approved_by: "Identifier of the user who decided on the proposal.",
  decision_reason: "Optional free-text rationale captured at approval/rejection time.",
  created_at: "Unix timestamp (seconds) when the proposal was created.",
  decided_at: "Unix timestamp (seconds) when the proposal reached a terminal status.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const hitlProposals = sqliteTable("hitl_proposals", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  instanceName: text("instance_name").notNull(),
  actionType: text("action_type", {
    enum: ["form_fill", "navigation", "click", "file_write", "external_call", "custom"],
  }).notNull(),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "expired", "executed"],
  })
    .notNull()
    .default("pending"),
  approvedBy: text("approved_by"),
  decisionReason: text("decision_reason"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  decidedAt: integer("decided_at", { mode: "timestamp" }),
});

// ---------------------------------------------------------------------------
// Zod schemas & types
// ---------------------------------------------------------------------------

export const insertHitlProposalSchema = createInsertSchema(hitlProposals);
export const selectHitlProposalSchema = createSelectSchema(hitlProposals);
export type HitlProposalRow = typeof hitlProposals.$inferSelect;
export type NewHitlProposalRow = typeof hitlProposals.$inferInsert;
