/**
 * @fileoverview TaskList — the `/tasks` island (hextaui task-list + task-filters).
 * Renders a filterable, server-sorted `<Table>` of tasks from `GET /api/tasks`.
 *
 * Features:
 *   - Faceted, multi-select TaskFilters bar (search, status[], priority[],
 *     project[], assignee[], label[], sort). Multi-values are serialized as
 *     comma-separated query params (e.g. `?status=todo,in_review`).
 *   - Read-only StatusBadge / PriorityBadge cells (no inline editing in the
 *     row) plus a trailing pencil action button that navigates to the full
 *     task viewport at `/tasks/{id}`.
 *   - Clicking a row opens a fast preview MODAL (TaskPreviewDialog) with an
 *     "Open full page" link to `/tasks/{id}`. Action controls inside the row
 *     (the pencil) stopPropagation so they don't also open the modal.
 *   - "New task" Dialog (TaskDialog) → `POST /api/tasks`
 *
 * The initial `projectId` filter can be seeded from the URL (`?projectId=`) so
 * a project card on `/projects` can deep-link straight into a filtered list.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { shortDate, relativeTime } from "@/lib/format";

import { AssigneeAvatar, EmptyState, ErrorState, LabelChips } from "./Shared";
import { PriorityBadge } from "./PriorityBadge";
import { TaskStatusBadge } from "./StatusBadge";
import { TaskDialog } from "./TaskDialog";
import { TaskPreviewDialog } from "./TaskPreviewDialog";
import {
  TaskFilters,
  activeFilterCount,
  emptyTaskQuery,
  type TaskQuery,
} from "./TaskFilters";
import { useProjects } from "./useProjects";
import {
  type ListEnvelope,
  type Task,
} from "./types";

export interface TaskListProps {
  /** Optional initial project filter (seeded from `?projectId=` on the page). */
  initialProjectId?: string;
}

export function TaskList({ initialProjectId }: TaskListProps) {
  const [query, setQuery] = useState<TaskQuery>(() => emptyTaskQuery(initialProjectId));
  const [debouncedQ, setDebouncedQ] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Preview modal state.
  const [previewTask, setPreviewTask] = useState<Task | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { nameById } = useProjects();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.q), 300);
    return () => clearTimeout(t);
  }, [query.q]);

  // Stable CSV keys so the load callback only re-fires when selections change.
  const statusKey = query.status.join(",");
  const priorityKey = query.priority.join(",");
  const projectKey = query.projectId.join(",");
  const assigneeKey = query.assignee.join(",");
  const labelKey = query.label.join(",");

  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ListEnvelope<Task>>("tasks", {
        q: debouncedQ || undefined,
        status: statusKey || undefined,
        priority: priorityKey || undefined,
        projectId: projectKey || undefined,
        assignee: assigneeKey || undefined,
        label: labelKey || undefined,
        sort: query.sort,
        limit: 100,
      });
      if (id !== reqId.current) return;
      setTasks(res.data);
      setTotal(res.total);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : "Failed to load tasks.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [debouncedQ, statusKey, priorityKey, projectKey, assigneeKey, labelKey, query.sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreated = useCallback((task: Task) => {
    setTasks((prev) => [task, ...prev]);
    setTotal((t) => t + 1);
  }, []);

  // Apply an edit from the preview modal back into the list.
  const handleUpdated = useCallback((task: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    setPreviewTask(task);
  }, []);

  const onChange = useCallback((patch: Partial<TaskQuery>) => {
    setQuery((q) => ({ ...q, ...patch }));
  }, []);

  const onClear = useCallback(() => setQuery(emptyTaskQuery()), []);

  const openPreview = useCallback((task: Task) => {
    setPreviewTask(task);
    setPreviewOpen(true);
  }, []);

  const hasFilters = useMemo(
    () => activeFilterCount({ ...query, q: debouncedQ }) > 0,
    [debouncedQ, query],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[16rem] flex-1">
          <TaskFilters
            value={query}
            onChange={onChange}
            onClear={onClear}
            filtered={tasks.length}
            total={total}
          />
        </div>
        <TaskDialog
          onSaved={handleCreated}
          defaultProjectId={query.projectId[0]}
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
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<PlusIcon />}
          title={hasFilters ? "No tasks match your filters" : "No tasks yet"}
          description={
            hasFilters
              ? "Adjust or clear the filters to see more tasks."
              : "Create a task to get started."
          }
          action={
            <TaskDialog
              onSaved={handleCreated}
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
        <div className="overflow-hidden rounded-xl ring-1 ring-border/40">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="min-w-[16rem]">Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow
                  key={task.id}
                  className={cn(
                    "cursor-pointer border-border/40 transition-colors hover:bg-muted/40",
                  )}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open task ${task.title}`}
                  onClick={() => openPreview(task)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPreview(task);
                    }
                  }}
                >
                  <TableCell className="max-w-[22rem]">
                    <span className="font-medium">{task.title}</span>
                    <LabelChips labels={task.labels} max={3} className="mt-1" />
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={task.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={task.priority} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {task.projectId ? (nameById.get(task.projectId) ?? "—") : "—"}
                  </TableCell>
                  <TableCell>
                    {task.assignee ? (
                      <AssigneeAvatar name={task.assignee} showName />
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {task.dueDate != null ? shortDate(task.dueDate) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {relativeTime(task.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      render={
                        <a
                          href={`/tasks/${task.id}`}
                          aria-label={`Edit task ${task.title}`}
                        />
                      }
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PencilIcon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
