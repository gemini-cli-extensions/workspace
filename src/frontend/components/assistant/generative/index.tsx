/**
 * @fileoverview Generative-UI library barrel + aggregate mount point.
 *
 * This is the reusable generative-UI toolkit for the assistant surfaces. Each
 * `makeAssistantToolUI` renderer registers itself with the active runtime when
 * mounted, so `<AssistantToolUIs />` mounts them all once (it renders nothing
 * visible). Drop it once inside the `AssistantRuntimeProvider`.
 *
 * Tool catalog (tool name → card):
 *   - showMetric      → {@link MetricToolUI}   (KPI card)
 *   - showCard        → {@link InfoCardToolUI} (titled summary card)
 *   - showChart       → {@link ChartToolUI}    (recharts bar/line/area/pie)
 *   - showMindmap     → {@link MindMapToolUI}  (mind-elixir mind map)
 *   - createTaskDraft → {@link TaskDraftToolUI} (task draft → real POST /api/tasks)
 *
 * A second agent retrofitting other showcases can import these renderers, the
 * standalone {@link MindMap}, or the shared types directly from this barrel.
 */

"use client";

import { ChartToolUI } from "./ChartCard";
import { InfoCardToolUI } from "./InfoCard";
import { MetricToolUI } from "./MetricCard";
import { MindMapToolUI } from "./MindMapCard";
import { TaskDraftToolUI } from "./TaskDraftCard";

export { MetricToolUI } from "./MetricCard";
export { InfoCardToolUI } from "./InfoCard";
export { ChartToolUI } from "./ChartCard";
export { MindMapToolUI } from "./MindMapCard";
export { TaskDraftToolUI } from "./TaskDraftCard";
export { MindMap, type MindMapProps } from "./MindMap";
export * from "./types";

/**
 * Registers all generative-UI tool renderers. Render once inside the runtime
 * provider, above (or beside) the Thread.
 */
export function AssistantToolUIs() {
  return (
    <>
      <MetricToolUI />
      <InfoCardToolUI />
      <ChartToolUI />
      <MindMapToolUI />
      <TaskDraftToolUI />
    </>
  );
}
