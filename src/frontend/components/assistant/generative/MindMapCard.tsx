/**
 * @fileoverview Generative-UI renderer for the `showMindmap` ChatBroker tool.
 *
 * Registers (via `makeAssistantToolUI`) a mind-map card for tool-call parts
 * whose `toolName === "showMindmap"`. Delegates the actual canvas to the
 * reusable {@link MindMap} component (mind-elixir).
 */

"use client";

import { NetworkIcon } from "lucide-react";

import { makeAssistantToolUI } from "@assistant-ui/react";

import { MindMap } from "./MindMap";
import { TOOL_NAMES, type ShowMindmapArgs, type ShowMindmapResult } from "./types";

/** Tool-UI component for `showMindmap`. Render inside the runtime provider. */
export const MindMapToolUI = makeAssistantToolUI<ShowMindmapArgs, ShowMindmapResult>({
  toolName: TOOL_NAMES.showMindmap,
  render: ({ args, result, status }) => {
    const isRunning = status?.type === "running" || (!result && status?.type !== "incomplete");
    const title = result?.title ?? args?.title ?? "Mind map";

    if (isRunning && !result) {
      return (
        <div className="my-2 w-full max-w-lg animate-pulse rounded-xl bg-card p-4 ring-1 ring-border/40">
          <div className="mb-3 h-4 w-32 rounded bg-muted/60" />
          <div className="h-48 w-full rounded bg-muted/40" />
        </div>
      );
    }

    const root = result?.root ?? args?.root;
    if (!root?.topic) return null;

    return (
      <div className="my-2 w-full max-w-lg overflow-hidden rounded-xl bg-card ring-1 ring-border/40">
        <div className="flex items-center gap-2 border-b border-border/30 px-4 py-2.5">
          <NetworkIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <div className="h-64 w-full bg-background/40">
          <MindMap root={root} />
        </div>
      </div>
    );
  },
});
