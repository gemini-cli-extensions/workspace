/**
 * @fileoverview WorkflowProgress — renders the workflows-agent's synced state as
 * a live progress view (overall bar + per-step list), NEVER as a raw object.
 *
 * The `workflows-agent` Durable Object broadcasts
 * `{ activeWorkflow: WorkflowState | null, lastProgress: ProgressUpdate | null }`
 * over the socket. The previous panel rendered `activeWorkflow` — an OBJECT —
 * directly as a React child, which crashed the whole page with React error #31
 * ("object with keys {workflowId,status,overallProgress,steps,startTime} is not
 * valid as a React child"). This component reads the object's fields explicitly
 * and only ever renders primitives (strings / numbers) as children.
 *
 * It is defensive by design: every field is optional-checked and coerced, so a
 * partial or unexpected frame degrades to an empty/placeholder state instead of
 * throwing.
 */

"use client";

import { type FC } from "react";

import { CheckIcon, CircleDashedIcon, Loader2Icon, XIcon } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** One step within a workflow, as streamed from the agent. */
export interface WorkflowStepView {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  progress?: number;
  startTime?: number;
  endTime?: number;
  error?: string;
}

/** The full workflow snapshot streamed in `activeWorkflow`. */
export interface WorkflowStateView {
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed";
  overallProgress?: number;
  steps?: WorkflowStepView[];
  startTime?: number;
  endTime?: number;
  error?: string;
}

/** A discrete progress event streamed in `lastProgress`. */
export interface WorkflowProgressEvent {
  step: string;
  percent: number;
  message?: string;
}

/** Props for {@link WorkflowProgress}. */
export interface WorkflowProgressProps {
  /** The active/last workflow snapshot, or null before anything runs. */
  workflow: WorkflowStateView | null | undefined;
  /** The most recent discrete progress event (drives sub-percent smoothness). */
  lastProgress?: WorkflowProgressEvent | null;
}

/** Map a step status to an icon + tint. */
const STEP_ICON: Record<WorkflowStepView["status"], FC<{ className?: string }>> = {
  pending: CircleDashedIcon,
  running: Loader2Icon,
  completed: CheckIcon,
  failed: XIcon,
};

/** Human duration between two epoch-ms timestamps. */
function duration(start?: number, end?: number): string | null {
  if (!start) return null;
  const stop = end ?? Date.now();
  const ms = Math.max(0, stop - start);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** A single step row: icon, label, status, timing. */
function StepRow({ step }: { step: WorkflowStepView }) {
  const Icon = STEP_ICON[step.status] ?? CircleDashedIcon;
  const time = duration(step.startTime, step.endTime);
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full ring-1",
          step.status === "completed" && "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
          step.status === "running" && "bg-primary/15 text-primary ring-primary/30",
          step.status === "failed" && "bg-destructive/15 text-destructive ring-destructive/30",
          step.status === "pending" && "bg-muted/40 text-muted-foreground ring-border/40",
        )}
      >
        <Icon className={cn("size-3.5", step.status === "running" && "animate-spin")} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{step.name}</p>
        {step.error ? (
          <p className="truncate text-[11px] text-destructive">{step.error}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground capitalize">{step.status}</p>
        )}
      </div>
      {time && <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{time}</span>}
    </li>
  );
}

/**
 * Render the workflow progress view. Reads only primitive fields off the state
 * object — it never places `workflow` (an object) directly into JSX.
 */
export function WorkflowProgress({ workflow, lastProgress }: WorkflowProgressProps) {
  if (!workflow || typeof workflow !== "object" || !workflow.workflowId) {
    return (
      <div className="rounded-md bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground ring-1 ring-border/40">
        No active workflow yet. Ask the agent to transcribe an audio URL or process a dataset to
        kick one off — steps will stream here live.
      </div>
    );
  }

  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  const overall = clampPercent(
    workflow.overallProgress ?? lastProgress?.percent ?? derivePercent(steps),
  );
  const totalTime = duration(workflow.startTime, workflow.endTime);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <code className="text-primary">{workflow.workflowId}</code>
            <StatusPill status={workflow.status} />
          </div>
          <span className="text-muted-foreground tabular-nums">{overall}%</span>
        </div>
        <Progress value={overall} />
        {lastProgress?.message && (
          <p className="text-[11px] text-muted-foreground">{lastProgress.message}</p>
        )}
      </div>

      {steps.length > 0 && (
        <ul className="divide-y divide-border/30 rounded-md bg-background/40 px-3 ring-1 ring-border/30">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ul>
      )}

      {workflow.status === "failed" && workflow.error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive ring-1 ring-destructive/30">
          Workflow failed: {workflow.error}
        </div>
      )}

      {totalTime && (
        <p className="text-right text-[10px] text-muted-foreground">Elapsed {totalTime}</p>
      )}
    </div>
  );
}

/** Colored status pill for the workflow's overall status. */
function StatusPill({ status }: { status: WorkflowStateView["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase",
        status === "completed" && "bg-emerald-500/15 text-emerald-400",
        status === "running" && "bg-primary/15 text-primary",
        status === "failed" && "bg-destructive/15 text-destructive",
        status === "pending" && "bg-muted/50 text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

/** Clamp any number-ish value into 0..100 (integer). */
function clampPercent(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Fallback overall percent derived from completed step count. */
function derivePercent(steps: WorkflowStepView[]): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => s.status === "completed").length;
  return (done / steps.length) * 100;
}
