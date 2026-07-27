/**
 * @fileoverview Generative-UI renderer for the `createTaskDraft` ChatBroker tool.
 *
 * Registers (via `makeAssistantToolUI`) a task-draft card for tool-call parts
 * whose `toolName === "createTaskDraft"`. The "Add to board" button REALLY
 * creates the task: it `POST`s to `/api/tasks` (title, priority, status:"todo",
 * description:notes) and then shows a success state (✓ Created + a link to
 * `/tasks/board`) or an error state — never a silent no-op. The button is
 * disabled while the request is pending.
 */

"use client";

import * as React from "react";

import {
  AlertTriangleIcon,
  CheckIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react";

import { makeAssistantToolUI } from "@assistant-ui/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { TOOL_NAMES, type CreateTaskDraftArgs, type CreateTaskDraftResult } from "./types";

/** Map a priority to its pill styling. */
const PRIORITY_STYLES: Record<CreateTaskDraftResult["priority"], string> = {
  high: "bg-rose-500/10 text-rose-400 ring-rose-500/20",
  medium: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  low: "bg-sky-500/10 text-sky-400 ring-sky-500/20",
};

/** Local commit state machine for the "Add to board" action. */
type CommitState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "success"; taskId: string }
  | { phase: "error"; message: string };

/** Tool-UI component for `createTaskDraft`. Render inside the runtime provider. */
export const TaskDraftToolUI = makeAssistantToolUI<CreateTaskDraftArgs, CreateTaskDraftResult>({
  toolName: TOOL_NAMES.createTaskDraft,
  render: ({ args, result, status }) => {
    const [commit, setCommit] = React.useState<CommitState>({ phase: "idle" });

    const title = result?.title ?? args?.title ?? "Untitled task";
    const priority = result?.priority ?? args?.priority ?? "medium";
    const notes = result?.notes ?? args?.notes ?? null;
    const isRunning = status?.type === "running" || (!result && status?.type !== "incomplete");

    /** POST the draft to the real tasks API and reflect success / error. */
    const addToBoard = React.useCallback(async () => {
      setCommit({ phase: "pending" });
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            priority,
            status: "todo",
            description: notes ?? undefined,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || `Request failed (${res.status})`);
        }
        const task = (await res.json()) as { id: string };
        setCommit({ phase: "success", taskId: task.id });
      } catch (error) {
        setCommit({
          phase: "error",
          message: error instanceof Error ? error.message : "Could not create task.",
        });
      }
    }, [title, priority, notes]);

    if (isRunning && !result) {
      return (
        <div className="my-2 w-full max-w-sm animate-pulse rounded-xl bg-card p-4 ring-1 ring-border/40">
          <div className="mb-3 h-4 w-40 rounded bg-muted/60" />
          <div className="h-3 w-24 rounded bg-muted/60" />
        </div>
      );
    }

    return (
      <div className="my-2 w-full max-w-sm rounded-xl bg-card p-4 ring-1 ring-border/40">
        <div className="mb-2 flex items-center gap-2">
          <ClipboardListIcon className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Task draft
          </span>
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1",
              PRIORITY_STYLES[priority],
            )}
          >
            {priority}
          </span>
        </div>

        <p className="text-sm font-semibold text-foreground">{title}</p>
        {notes ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{notes}</p>
        ) : null}

        {commit.phase === "error" ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-400 ring-1 ring-rose-500/20">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>{commit.message}</span>
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-end gap-2">
          {commit.phase === "success" ? (
            <>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                <CheckIcon className="size-3.5" />
                Created
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  window.location.href = "/tasks/board";
                }}
              >
                View board
                <ExternalLinkIcon className="size-3.5" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={commit.phase === "pending"}
              onClick={addToBoard}
              variant={commit.phase === "error" ? "secondary" : "default"}
            >
              {commit.phase === "pending" ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <PlusIcon className="size-3.5" />
                  {commit.phase === "error" ? "Retry" : "Add to board"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  },
});
