/**
 * @fileoverview TaskSubtasks — the "Subtasks" card on the task viewport, backed
 * by the parent-child task graph (migration 0004) rather than the old
 * `task_subtasks` checklist. Every subtask is a real {@link Task} that happens
 * to be a child of the current task.
 *
 *   Children  → `GET /api/tasks/{id}/children` → `{ data: Task[] }`. Each row
 *               shows the short id (first 8 chars, monospace) + status badge +
 *               priority + title + owner (assignee avatar initials + name, or
 *               "Unassigned"). Clicking a row opens the {@link TaskPreviewDialog}
 *               quick-look, which offers "Open full page" → `/tasks/{childId}`.
 *   Header    → a plain "{done}/{total} completed" tally derived from the
 *               children (done = child.status === "done"). NO progress bar and NO
 *               steppers live here — the task's completion % and its editor now
 *               live solely in the ProgressCard on the viewport's right column.
 *   Add-exist → {@link SubtaskLinker}: debounce typeahead over `GET /api/tasks?q`
 *               + id-paste, each linking via `PATCH /api/tasks/{id}
 *               {parentId:currentId}` then refetching children. Self / existing
 *               children / ancestors are excluded to avoid cycles; backend 400s
 *               surface inline.
 *   Create    → "Create new subtask" opens {@link TaskDialog} prefilled with
 *               `parentId = currentId`; the POST creates a pre-linked child and
 *               we refetch on save.
 *   Unlink    → per-row remove affordance → `PATCH {parentId:null}` then refetch.
 *
 * Because completion is derived from the children's statuses, we surface
 * `onProgressChange(progress)` so the parent viewport (board / table / sidebar /
 * ProgressCard) stays in sync without a full refetch.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListTreeIcon, PlusIcon, Unlink2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiSend, ApiError } from "@/lib/api";

import { AssigneeAvatar, ErrorState } from "./Shared";
import { PriorityBadge } from "./PriorityBadge";
import { TaskStatusBadge } from "./StatusBadge";
import { SubtaskLinker } from "./SubtaskLinker";
import { TaskDialog } from "./TaskDialog";
import { TaskPreviewDialog } from "./TaskPreviewDialog";
import type { Task } from "./types";

/** Derive the 0–100 completion percentage from a set of child tasks. */
function deriveProgress(children: Task[]): number {
  if (children.length === 0) return 0;
  const done = children.filter((c) => c.status === "done").length;
  return Math.round((done / children.length) * 100);
}

export interface TaskSubtasksProps {
  /** The current (parent) task id. */
  taskId: string;
  /**
   * The task's own `progress` (0–100). Used ONLY as a read-only fallback for the
   * header tally when the task has zero children (completion is otherwise derived
   * from the children's statuses). The progress EDITOR lives in the ProgressCard.
   */
  taskProgress: number;
  /**
   * Called with the newly-derived 0–100 completion percentage whenever the
   * child set changes, so the parent can keep `task.progress` in sync.
   */
  onProgressChange?: (progress: number) => void;
}

/** Subtasks (child-tasks) card for a single task. */
export function TaskSubtasks({
  taskId,
  taskProgress,
  onProgressChange,
}: TaskSubtasksProps) {
  const [children, setChildren] = useState<Task[]>([]);
  const [ancestorIds, setAncestorIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Task | null>(null);

  // Keep the latest `onProgressChange` in a ref so `load` does NOT depend on it.
  // The parent may pass a fresh callback each render; if `load` depended on it,
  // `useEffect(..., [load])` would refetch every render → an infinite
  // children/ancestors fetch loop (which Cloudflare eventually 403-rate-limits).
  const onProgressChangeRef = useRef(onProgressChange);
  useEffect(() => {
    onProgressChangeRef.current = onProgressChange;
  }, [onProgressChange]);

  /** Load the current task's direct children + ancestor ids (for cycle guard). */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [childRes, ancestorRes] = await Promise.all([
        apiGet<{ data: Task[] }>(`tasks/${taskId}/children`),
        apiGet<{ data: { id: string }[] }>(`tasks/${taskId}/ancestors`),
      ]);
      const kids = childRes.data ?? [];
      setChildren(kids);
      setAncestorIds((ancestorRes.data ?? []).map((a) => a.id));
      // Only mirror CHILD-DERIVED progress up to the parent when the task
      // actually has children. For a childless task the task's own stored
      // progress governs (set manually via the ProgressCard), so firing
      // onProgressChange(0) here would wrongly clobber it back to 0%.
      if (kids.length > 0) {
        onProgressChangeRef.current?.(deriveProgress(kids));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load subtasks.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Unlink a child from this task (`PATCH {parentId:null}`), then refetch. */
  const unlink = useCallback(
    async (child: Task) => {
      const prev = children;
      const next = children.filter((c) => c.id !== child.id);
      setChildren(next);
      onProgressChange?.(deriveProgress(next));
      try {
        await apiSend<Task>("PATCH", `tasks/${child.id}`, { parentId: null });
      } catch (e) {
        setChildren(prev);
        onProgressChange?.(deriveProgress(prev));
        setError(e instanceof ApiError ? e.message : "Failed to remove subtask.");
      }
    },
    [children, onProgressChange],
  );

  const hasChildren = children.length > 0;
  const doneCount = useMemo(
    () => children.filter((c) => c.status === "done").length,
    [children],
  );
  // Completion: derived from children when present, else the task's own progress.
  const completion = hasChildren ? deriveProgress(children) : taskProgress;

  // Ids excluded from the linker's suggestions to avoid cycles: self, existing
  // children, and ancestors.
  const excludeIds = useMemo(
    () => new Set<string>([taskId, ...children.map((c) => c.id), ...ancestorIds]),
    [taskId, children, ancestorIds],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ListTreeIcon className="size-4 text-muted-foreground" />
            Subtasks
          </CardTitle>
          <span className="text-xs tabular-nums text-muted-foreground">
            {hasChildren ? `${doneCount}/${children.length} completed` : `${completion}% complete`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <ErrorState message={error} onRetry={load} /> : null}

        {/* Child list. Clicking a row opens the quick-look preview. */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading subtasks…</p>
        ) : !hasChildren ? (
          <p className="text-sm text-muted-foreground">
            No subtasks yet. Link an existing task or create a new one below.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/40">
            {children.map((child) => (
              <li
                key={child.id}
                className="group/child flex items-center gap-2.5 py-2 first:pt-0 last:pb-0"
              >
                <button
                  type="button"
                  onClick={() => setPreview(child)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-0.5 text-left hover:bg-muted/30"
                  aria-label={`Preview subtask "${child.title}"`}
                >
                  {/* Short id (first 8 chars, monospace) for quick reference. */}
                  <code
                    className="hidden shrink-0 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline"
                    title={child.id}
                  >
                    {child.id.slice(0, 8)}
                  </code>
                  <TaskStatusBadge status={child.status} className="shrink-0" />
                  <PriorityBadge priority={child.priority} className="shrink-0" />
                  <span
                    className={
                      "min-w-0 flex-1 truncate text-sm" +
                      (child.status === "done" ? " text-muted-foreground line-through" : "")
                    }
                  >
                    {child.title}
                  </span>
                  {/* Owner (assignee): avatar initials + name, or "Unassigned". */}
                  <AssigneeAvatar
                    name={child.assignee}
                    showName
                    className="ml-auto hidden max-w-[9rem] shrink-0 md:flex"
                  />
                </button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove "${child.title}" from subtasks`}
                  className="opacity-0 transition-opacity group-hover/child:opacity-100"
                  onClick={() => void unlink(child)}
                >
                  <Unlink2Icon className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Add existing (typeahead + id paste). */}
        <SubtaskLinker
          taskId={taskId}
          excludeIds={excludeIds}
          onLinked={() => void load()}
          onError={(msg) => setError(msg || null)}
        />

        {/* Create new subtask (pre-linked child via TaskDialog parentId). */}
        <TaskDialog
          parentId={taskId}
          onSaved={() => void load()}
          trigger={
            <Button variant="outline" size="sm" className="self-start">
              <PlusIcon className="size-4" />
              Create new subtask
            </Button>
          }
        />
      </CardContent>

      {/* Quick-look preview for a clicked child → "Open full page" → /tasks/{id}. */}
      <TaskPreviewDialog
        task={preview}
        open={preview !== null}
        onOpenChange={(o) => !o && setPreview(null)}
        onSaved={(updated) => {
          setChildren((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          setPreview(updated);
        }}
      />
    </Card>
  );
}
