/**
 * @fileoverview Wire-contract types shared between the `ChatBroker` Durable
 * Object's demo tools and their client-side `makeAssistantToolUI` renderers.
 *
 * These MUST stay in lockstep with the Zod `inputSchema` / `execute` return
 * shapes declared in `src/backend/ai/agents/ChatBroker/index.ts`. They are the
 * generative-UI contract: the model emits args matching `*Args`, the tool
 * `execute` returns `*Result`, and the card renders `*Result`.
 */

/** Args the model passes to `showMetric`. */
export interface ShowMetricArgs {
  label: string;
  value: string;
  deltaPct?: number;
  hint?: string;
}

/** Structured result `showMetric.execute` returns (rendered by the KPI card). */
export interface ShowMetricResult {
  label: string;
  value: string;
  deltaPct: number | null;
  hint: string | null;
  generatedAt: string;
}

/** Args the model passes to `createTaskDraft`. */
export interface CreateTaskDraftArgs {
  title: string;
  priority?: "low" | "medium" | "high";
  notes?: string;
}

/** Structured result `createTaskDraft.execute` returns (rendered by the card). */
export interface CreateTaskDraftResult {
  id: string;
  title: string;
  priority: "low" | "medium" | "high";
  notes: string | null;
  status: "draft";
  createdAt: string;
}

/** Tool names — single source of truth for the `toolName` match (case-sensitive). */
export const TOOL_NAMES = {
  showMetric: "showMetric",
  createTaskDraft: "createTaskDraft",
} as const;
