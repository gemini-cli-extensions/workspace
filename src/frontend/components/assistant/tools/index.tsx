/**
 * @fileoverview Barrel + aggregate mount point for the ChatBroker generative-UI
 * tool renderers.
 *
 * `<AssistantToolUIs />` mounts every `makeAssistantToolUI` component once;
 * mounting is what registers each renderer with the active runtime. Drop it
 * once inside the `AssistantRuntimeProvider` (it renders nothing visible).
 */

"use client";

import { MetricToolUI } from "./MetricToolUI";
import { TaskDraftToolUI } from "./TaskDraftToolUI";

export { MetricToolUI } from "./MetricToolUI";
export { TaskDraftToolUI } from "./TaskDraftToolUI";
export * from "./types";

/**
 * Registers all ChatBroker tool-UI renderers. Render once inside the runtime
 * provider, above (or beside) the Thread.
 */
export function AssistantToolUIs() {
  return (
    <>
      <MetricToolUI />
      <TaskDraftToolUI />
    </>
  );
}
