/**
 * @fileoverview Wire-contract types shared between the `ChatBroker` Durable
 * Object's generative-UI tools and their client-side `makeAssistantToolUI`
 * renderers.
 *
 * These MUST stay in lockstep with the Zod `inputSchema` / `execute` return
 * shapes declared in `src/backend/ai/agents/ChatBroker/index.ts`. They are the
 * generative-UI contract: the model emits args matching `*Args`, the tool
 * `execute` returns `*Result`, and the card renders `*Result`.
 */

// ---------------------------------------------------------------------------
// showMetric
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// showCard
// ---------------------------------------------------------------------------

/** Args the model passes to `showCard`. */
export interface ShowCardArgs {
  title: string;
  body: string;
  bullets?: string[];
  footnote?: string;
}

/** Structured result `showCard.execute` returns (rendered by the info card). */
export interface ShowCardResult {
  title: string;
  body: string;
  bullets: string[] | null;
  footnote: string | null;
}

// ---------------------------------------------------------------------------
// showChart
// ---------------------------------------------------------------------------

/** A single labelled chart data point. */
export interface ChartPoint {
  label: string;
  value: number;
}

/** Supported chart kinds. */
export type ChartKind = "bar" | "line" | "area" | "pie";

/** Args the model passes to `showChart`. */
export interface ShowChartArgs {
  kind: ChartKind;
  title: string;
  data: ChartPoint[];
  series?: string;
}

/** Structured result `showChart.execute` returns (rendered by the chart card). */
export interface ShowChartResult {
  kind: ChartKind;
  title: string;
  data: ChartPoint[];
  series: string | null;
}

// ---------------------------------------------------------------------------
// showMindmap
// ---------------------------------------------------------------------------

/** A recursive mind-map node, as authored by the model. */
export interface MindmapNode {
  topic: string;
  children?: MindmapNode[];
}

/** Args the model passes to `showMindmap`. */
export interface ShowMindmapArgs {
  title: string;
  root: MindmapNode;
}

/** Structured result `showMindmap.execute` returns (rendered by the mind map). */
export interface ShowMindmapResult {
  title: string;
  root: MindmapNode;
}

// ---------------------------------------------------------------------------
// createTaskDraft
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tool names — single source of truth for `toolName` matching (case-sensitive)
// ---------------------------------------------------------------------------

export const TOOL_NAMES = {
  showMetric: "showMetric",
  showCard: "showCard",
  showChart: "showChart",
  showMindmap: "showMindmap",
  createTaskDraft: "createTaskDraft",
} as const;
