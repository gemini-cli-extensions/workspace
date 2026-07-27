/**
 * @fileoverview Generative-UI renderer for the `createTaskDraft` ChatBroker tool.
 *
 * Registers (via `makeAssistantToolUI`) a renderer for tool-call parts whose
 * `toolName === "createTaskDraft"`. Renders a Monolith task-draft card with the
 * title, a priority pill, and optional notes. The card is presentational — the
 * "Add to board" button is a local no-op affordance that demonstrates how a
 * real app would commit the draft (e.g. POST to the tasks API).
 */

"use client";

import * as React from "react";

import { CheckIcon, ClipboardListIcon, PlusIcon } from "lucide-react";

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

/**
 * Tool-UI component for `createTaskDraft`. Render it inside the runtime provider
 * to register the renderer.
 */
export const TaskDraftToolUI = makeAssistantToolUI<CreateTaskDraftArgs, CreateTaskDraftResult>({
  toolName: TOOL_NAMES.createTaskDraft,
  render: ({ args, result, status }) => {
    const [added, setAdded] = React.useState(false);

    const title = result?.title ?? args?.title ?? "Untitled task";
    const priority = result?.priority ?? args?.priority ?? "medium";
    const notes = result?.notes ?? args?.notes ?? null;
    const isRunning = status?.type === "running" || (!result && status?.type !== "incomplete");

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

        <div className="mt-3 flex items-center justify-end">
          <Button
            size="sm"
            variant={added ? "secondary" : "default"}
            disabled={added}
            onClick={() => setAdded(true)}
          >
            {added ? (
              <>
                <CheckIcon className="size-3.5" />
                Added
              </>
            ) : (
              <>
                <PlusIcon className="size-3.5" />
                Add to board
              </>
            )}
          </Button>
        </div>
      </div>
    );
  },
});
