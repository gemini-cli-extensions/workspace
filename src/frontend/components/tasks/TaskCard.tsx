/**
 * @fileoverview TaskCard — a draggable kanban card for the TaskBoard. Shows
 * title, truncated description, priority badge, labels, assignee avatar, and
 * due date. Exposes HTML5 drag handlers plus explicit "Move" buttons (keyboard
 * + touch accessible fallback) so a card can change columns without a pointer.
 */

import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { shortDate } from "@/lib/format";

import { AssigneeAvatar, LabelChips } from "./Shared";
import { PriorityBadge } from "./PriorityBadge";
import { BOARD_STATUSES, type Task, type TaskStatus } from "./types";

export interface TaskCardProps {
  task: Task;
  /** Move the task to an adjacent column. */
  onMove: (task: Task, direction: -1 | 1) => void;
  /** Begin an HTML5 drag for this task. */
  onDragStart: (task: Task) => void;
  /** Open the task preview modal. */
  onOpen: (task: Task) => void;
  /** Whether a move/patch is currently in flight for this card. */
  pending?: boolean;
}

export function TaskCard({ task, onMove, onDragStart, onOpen, pending }: TaskCardProps) {
  const colIndex = BOARD_STATUSES.indexOf(task.status as TaskStatus);
  const canMoveLeft = colIndex > 0;
  const canMoveRight = colIndex < BOARD_STATUSES.length - 1;

  return (
    <Card
      size="sm"
      draggable
      role="button"
      tabIndex={0}
      aria-label={`Open task ${task.title}`}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(task);
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart(task);
      }}
      className={
        "cursor-grab transition-[opacity,background-color] hover:bg-card/80 active:cursor-grabbing " +
        (pending ? "opacity-60" : "")
      }
    >
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-medium">{task.title}</span>
          <PriorityBadge priority={task.priority} className="shrink-0" />
        </div>

        {task.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
        ) : null}

        <LabelChips labels={task.labels} max={3} />

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <AssigneeAvatar name={task.assignee} />
          {task.dueDate != null ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarIcon className="size-3.5" />
              {shortDate(task.dueDate)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-between pt-1">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Move to previous column"
            disabled={!canMoveLeft || pending}
            onClick={(e) => {
              e.stopPropagation();
              onMove(task, -1);
            }}
          >
            <ChevronLeftIcon className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Move to next column"
            disabled={!canMoveRight || pending}
            onClick={(e) => {
              e.stopPropagation();
              onMove(task, 1);
            }}
          >
            <ChevronRightIcon className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
