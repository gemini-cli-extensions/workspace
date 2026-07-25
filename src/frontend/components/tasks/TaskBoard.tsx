/**
 * @fileoverview TaskBoard — the `/tasks/board` island (hextaui "task-board").
 * Loads `GET /api/tasks/board` (server returns `{ columns: [...] }`) and renders
 * four kanban columns: Not Started / In Progress / In Review / Done.
 *
 * Moving a card — via HTML5 drag-drop onto a column, or via the per-card
 * Move buttons — issues `PATCH /api/tasks/{id}` with the new `status`. Updates
 * are optimistic with rollback on failure. A "New task" Dialog (TaskDialog)
 * creates a task and slots it into the right column.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { EmptyState, ErrorState } from "./Shared";
import { TaskCard } from "./TaskCard";
import { TaskDialog } from "./TaskDialog";
import { TaskPreviewDialog } from "./TaskPreviewDialog";
import { useProjects } from "./useProjects";
import {
  BOARD_STATUSES,
  STATUS_LABELS,
  type BoardColumn,
  type BoardResponse,
  type Task,
  type TaskStatus,
} from "./types";

export function TaskBoard() {
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const draggingRef = useRef<Task | null>(null);

  // Preview modal state.
  const [previewTask, setPreviewTask] = useState<Task | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { nameById } = useProjects();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<BoardResponse>("tasks/board");
      setColumns(res.columns);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalTasks = useMemo(
    () => columns.reduce((sum, c) => sum + c.tasks.length, 0),
    [columns],
  );

  /** Move a task into a target status, optimistically, then PATCH the server. */
  const moveToStatus = useCallback(
    async (task: Task, target: TaskStatus) => {
      if (task.status === target) return;
      const previousStatus = task.status;
      setPendingId(task.id);
      setColumns((prev) => applyMove(prev, task, target));
      try {
        await apiSend<Task>("PATCH", `tasks/${task.id}`, { status: target });
      } catch (e) {
        // Roll back to the original column.
        setColumns((prev) => applyMove(prev, { ...task, status: target }, previousStatus));
        setError(e instanceof ApiError ? e.message : "Failed to move task.");
      } finally {
        setPendingId(null);
      }
    },
    [],
  );

  const handleAdjacentMove = useCallback(
    (task: Task, direction: -1 | 1) => {
      const idx = BOARD_STATUSES.indexOf(task.status);
      const next = BOARD_STATUSES[idx + direction];
      if (next) void moveToStatus(task, next);
    },
    [moveToStatus],
  );

  const handleDrop = useCallback(
    (target: TaskStatus) => {
      const task = draggingRef.current;
      draggingRef.current = null;
      setDragOver(null);
      if (task) void moveToStatus(task, target);
    },
    [moveToStatus],
  );

  // Insert a freshly created task into its column.
  const handleCreated = useCallback((task: Task) => {
    setColumns((prev) =>
      prev.map((col) => (col.status === task.status ? { ...col, tasks: [task, ...col.tasks] } : col)),
    );
  }, []);

  const openPreview = useCallback((task: Task) => {
    setPreviewTask(task);
    setPreviewOpen(true);
  }, []);

  // Reconcile an edited task back into the board. If its status changed, move
  // it to the correct column; otherwise replace it in place.
  const handleUpdated = useCallback((updated: Task) => {
    setPreviewTask(updated);
    setColumns((prev) => {
      const without = prev.map((col) => ({
        ...col,
        tasks: col.tasks.filter((t) => t.id !== updated.id),
      }));
      return without.map((col) =>
        col.status === updated.status ? { ...col, tasks: [updated, ...col.tasks] } : col,
      );
    });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {totalTasks} {totalTasks === 1 ? "task" : "tasks"} across {BOARD_STATUSES.length} columns
        </p>
        <TaskDialog
          onSaved={handleCreated}
          trigger={
            <Button>
              <PlusIcon className="size-4" />
              New task
            </Button>
          }
        />
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {BOARD_STATUSES.map((s) => (
            <div key={s} className="flex flex-col gap-3 rounded-xl bg-muted/20 p-3 ring-1 ring-border/40">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : totalTasks === 0 ? (
        <EmptyState
          icon={<PlusIcon />}
          title="No tasks on the board"
          description="Create your first task to populate the Not Started column."
          action={
            <TaskDialog
              onSaved={handleCreated}
              defaultStatus="todo"
              trigger={
                <Button variant="outline">
                  <PlusIcon className="size-4" />
                  New task
                </Button>
              }
            />
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {columns.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.status);
              }}
              onDragLeave={() => setDragOver((d) => (d === col.status ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(col.status);
              }}
              className={cn(
                "flex flex-col gap-3 rounded-xl bg-muted/20 p-3 ring-1 transition-colors",
                dragOver === col.status ? "ring-ring/60 bg-muted/40" : "ring-border/40",
              )}
            >
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-medium">{STATUS_LABELS[col.status]}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {col.tasks.length}
                </span>
              </div>

              <div className="flex min-h-12 flex-col gap-3">
                {col.tasks.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground/70">
                    Drop tasks here
                  </p>
                ) : (
                  col.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      pending={pendingId === task.id}
                      onMove={handleAdjacentMove}
                      onOpen={openPreview}
                      onDragStart={(t) => {
                        draggingRef.current = t;
                      }}
                    />
                  ))
                )}
              </div>

              <TaskDialog
                onSaved={handleCreated}
                defaultStatus={col.status}
                trigger={
                  <Button variant="ghost" size="sm" className="justify-start text-muted-foreground">
                    <PlusIcon className="size-4" />
                    Add task
                  </Button>
                }
              />
            </div>
          ))}
        </div>
      )}

      <TaskPreviewDialog
        task={previewTask}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        projectName={previewTask?.projectId ? nameById.get(previewTask.projectId) : null}
        onSaved={handleUpdated}
      />
    </div>
  );
}

/**
 * Pure helper: return new columns with `task` removed from its current column
 * and prepended to the `target` column (with its status updated).
 */
function applyMove(columns: BoardColumn[], task: Task, target: TaskStatus): BoardColumn[] {
  return columns.map((col) => {
    if (col.status === task.status) {
      return { ...col, tasks: col.tasks.filter((t) => t.id !== task.id) };
    }
    if (col.status === target) {
      return { ...col, tasks: [{ ...task, status: target }, ...col.tasks] };
    }
    return col;
  });
}
