/**
 * @fileoverview TaskPreviewDialog — a fast, read-focused preview modal opened by
 * clicking a task row (list) or card (board). It renders the already-loaded
 * {@link Task} (no extra fetch) with its status, priority, project, assignee,
 * due date, labels, progress and description, plus actions: "Open full page"
 * (→ `/tasks/{id}`) and an inline edit via {@link TaskDialog}.
 *
 * It is fully controlled (`open` / `onOpenChange`) so the host island owns the
 * open state and can key it to the clicked task. Reuses the project's Base-UI
 * Dialog (Monolith dark theme, ring separation, no 1px borders, no alert()).
 */

"use client";

import { type ReactNode } from "react";
import { ArrowUpRightIcon, CalendarIcon, PencilIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { shortDate, relativeTime } from "@/lib/format";

import { AssigneeAvatar, LabelChips } from "./Shared";
import { PriorityBadge } from "./PriorityBadge";
import { TaskStatusBadge } from "./StatusBadge";
import { TaskDialog } from "./TaskDialog";
import { htmlToPlainText } from "./task-html";
import type { Task } from "./types";

export interface TaskPreviewDialogProps {
  /** The task to preview, or null when nothing is selected. */
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Display name for the task's project, if known. */
  projectName?: string | null;
  /** Called with the updated task after an inline edit save. */
  onSaved: (task: Task) => void;
}

export function TaskPreviewDialog({
  task,
  open,
  onOpenChange,
  projectName,
  onSaved,
}: TaskPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {task ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <TaskStatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
              </div>
              <DialogTitle className="text-lg leading-snug">{task.title}</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              {/* `description` may hold HTML, a legacy Plate envelope, or plain
                  text; render the flattened plain-text snippet so the quick-look
                  never leaks raw HTML/JSON (and never mounts the Plate editor in
                  a list context). */}
              {task.description && htmlToPlainText(task.description).trim() ? (
                <p className="line-clamp-6 text-sm whitespace-pre-wrap text-muted-foreground">
                  {htmlToPlainText(task.description)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">No description</p>
              )}

              <div className="flex items-center gap-3">
                <Progress value={task.progress} className="flex-1" />
                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                  {task.progress}%
                </span>
              </div>

              <Separator className="bg-border/40" />

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <PreviewRow label="Assignee">
                  {task.assignee ? (
                    <AssigneeAvatar name={task.assignee} showName />
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </PreviewRow>
                <PreviewRow label="Project">
                  <span className="truncate text-muted-foreground">
                    {projectName ?? "—"}
                  </span>
                </PreviewRow>
                <PreviewRow label="Due date">
                  {task.dueDate != null ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <CalendarIcon className="size-3.5" />
                      {shortDate(task.dueDate)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </PreviewRow>
                <PreviewRow label="Updated">
                  <span className="text-muted-foreground">{relativeTime(task.updatedAt)}</span>
                </PreviewRow>
              </dl>

              {task.labels.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    Labels
                  </span>
                  <LabelChips labels={task.labels} />
                </div>
              ) : null}

              <Separator className="bg-border/40" />

              <div className="flex flex-wrap items-center justify-end gap-2">
                <TaskDialog
                  task={task}
                  onSaved={onSaved}
                  trigger={
                    <Button variant="outline" size="sm">
                      <PencilIcon className="size-4" />
                      Edit
                    </Button>
                  }
                />
                <Button
                  size="sm"
                  render={<a href={`/tasks/${task.id}`} aria-label="Open full task page" />}
                >
                  <ArrowUpRightIcon className="size-4" />
                  Open full page
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
