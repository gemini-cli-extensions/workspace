/**
 * @fileoverview StatusBadge — pills for both task workflow status and project
 * lifecycle status. Two small components share one color vocabulary so the
 * "todo / in_progress / in_review / done" and "active / archived / on_hold"
 * states read identically across the board, list, detail, and project pages.
 *
 * Like {@link PriorityBadge} these use explicit dark-tuned `bg/text` pairs and
 * a transparent border (no 1px separators) to satisfy the Monolith rules.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  PROJECT_STATUS_LABELS,
  STATUS_LABELS,
  type ProjectStatus,
  type TaskStatus,
} from "./types";

/** Task status → class pair. */
const TASK_STATUS_CLASSES: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-sky-500/15 text-sky-300",
  in_review: "bg-violet-500/15 text-violet-300",
  done: "bg-emerald-500/15 text-emerald-300",
};

/** Project status → class pair. */
const PROJECT_STATUS_CLASSES: Record<ProjectStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  on_hold: "bg-amber-500/15 text-amber-300",
  archived: "bg-muted text-muted-foreground",
};

export function TaskStatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", TASK_STATUS_CLASSES[status], className)}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", PROJECT_STATUS_CLASSES[status], className)}
    >
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}
