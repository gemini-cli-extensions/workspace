/**
 * @fileoverview Generative-UI renderer for the `showMetric` ChatBroker tool.
 *
 * `makeAssistantToolUI` registers this renderer for tool-call message parts
 * whose `toolName === "showMetric"` (case-sensitive). While the tool is running
 * we show a skeleton; once `result` arrives we render a Monolith KPI card with
 * the value, an optional delta pill, and a supporting hint.
 *
 * Mounting the returned component anywhere inside the `AssistantRuntimeProvider`
 * registers the renderer — see `runtime.tsx` / `Thread.tsx`.
 */

"use client";

import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { makeAssistantToolUI } from "@assistant-ui/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { TOOL_NAMES, type ShowMetricArgs, type ShowMetricResult } from "./types";

/** Format a signed percentage for the delta pill. */
function formatDelta(deltaPct: number): string {
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${deltaPct.toFixed(1)}%`;
}

/**
 * Tool-UI component for `showMetric`. Render it inside the runtime provider to
 * register the renderer.
 */
export const MetricToolUI = makeAssistantToolUI<ShowMetricArgs, ShowMetricResult>({
  toolName: TOOL_NAMES.showMetric,
  render: ({ args, result, status }) => {
    const isRunning = status?.type === "running" || (!result && status?.type !== "incomplete");
    const label = result?.label ?? args?.label ?? "Metric";

    if (isRunning && !result) {
      return (
        <div className="my-2 w-full max-w-xs animate-pulse rounded-xl bg-card p-4 ring-1 ring-border/40">
          <div className="mb-3 h-3 w-24 rounded bg-muted/60" />
          <div className="h-7 w-32 rounded bg-muted/60" />
        </div>
      );
    }

    const value = result?.value ?? args?.value ?? "—";
    const deltaPct = result?.deltaPct ?? args?.deltaPct ?? null;
    const hint = result?.hint ?? args?.hint ?? null;
    const up = deltaPct != null && deltaPct >= 0;

    return (
      <div className="my-2 w-full max-w-xs rounded-xl bg-card p-4 ring-1 ring-border/40">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <Badge variant="outline" className="text-[10px] font-mono tracking-wide">
            KPI
          </Badge>
        </div>

        <div className="flex items-end justify-between gap-3">
          <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </span>
          {deltaPct != null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                up
                  ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 ring-rose-500/20",
              )}
            >
              {up ? (
                <TrendingUpIcon className="size-3" />
              ) : (
                <TrendingDownIcon className="size-3" />
              )}
              {formatDelta(deltaPct)}
            </span>
          ) : null}
        </div>

        {hint ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
    );
  },
});
