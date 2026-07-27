/**
 * @fileoverview TaskDetail — the `/tasks/[id]` task viewport. Retrofits the
 * framework's two-column layout onto our Base-UI + Monolith surface, bound to
 * the real task API (`GET`/`PATCH`/`DELETE /api/tasks/{id}` + `/api/projects`):
 *
 *   Header       → StatusBadge + PriorityBadge pill row, then the title as an H1
 *                  (title editable inline via PATCH).
 *   Layout       → `lg:grid-cols-[1fr_264px]`. On mobile the sidebar stacks
 *                  ABOVE the main column via `order` classes.
 *   Breadcrumbs  → an ancestor trail at the very top ({@link TaskBreadcrumbs},
 *                  from `GET /api/tasks/{id}/ancestors`).
 *   Left column  → (1) Description card — a PlateJS rich-text editor/renderer
 *                  (shared with team notes), PATCHing the serialized Plate
 *                  envelope into `task.description`. (2) Subtasks (child tasks
 *                  backed by /api/tasks/{id}/children, completion + radial gauge
 *                  derived from their statuses) + (3) Comments (thread +
 *                  composer) + (4) Attachments (R2-backed upload/stream) — all
 *                  fully backed by their own API routes.
 *   Right column → {@link TaskDetailSidebar} Properties card (status, priority,
 *                  assignees, project, started, due date, labels).
 *   Delete       → AlertDialog → `DELETE /api/tasks/{id}` (never window.confirm).
 *
 * Receives the route `id` from the Astro page (`Astro.params.id`). All error
 * paths surface inline via {@link ErrorState} — no alert()/confirm()/prompt().
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon, PencilIcon, Trash2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, ApiError } from "@/lib/api";

import { ErrorState } from "./Shared";
import { PriorityBadge } from "./PriorityBadge";
import { ProgressCard } from "./ProgressCard";
import { TaskBreadcrumbs } from "./TaskBreadcrumbs";
import { TaskStatusBadge } from "./StatusBadge";
import { TaskAttachments } from "./TaskAttachments";
import { TaskComments } from "./TaskComments";
import { TaskDetailSidebar } from "./TaskDetailSidebar";
import { TaskRichEditor } from "./TaskRichEditor";
import { TaskRichHtml } from "./TaskRichHtml";
import { htmlToPlainText } from "./task-html";
import { TaskSubtasks } from "./TaskSubtasks";
import { type Task } from "./types";

export interface TaskDetailProps {
  id: string;
}

export function TaskDetail({ id }: TaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");

  // PlateJS (description editor + renderer) is browser-only. This page mounts as
  // a `client:load` island, so guard Plate behind a mounted flag: during SSR /
  // first hydration paint we render a lightweight placeholder, then swap in the
  // real editor/renderer after mount. Prevents React #418/#425 hydration errors.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await apiGet<Task>(`tasks/${id}`);
      setTask(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNotFound(true);
      } else {
        setError(e instanceof ApiError ? e.message : "Failed to load task.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Patch a set of fields, optimistically updating local state.
   *
   * Completion coupling: moving a task to the `"done"` status implies 100%
   * completion, so when the incoming patch sets `status: "done"` (and progress
   * isn't already being set / already 100) we merge `progress: 100` into the same
   * PATCH. This keeps the ProgressCard radial and the status badge in agreement.
   */
  const patch = useCallback(
    async (body: Partial<Task>) => {
      if (!task) return;
      const effective: Partial<Task> =
        body.status === "done" && body.progress == null && task.progress < 100
          ? { ...body, progress: 100 }
          : body;
      const prev = task;
      setSaving(true);
      setError(null);
      setTask({ ...task, ...effective });
      try {
        const updated = await apiSend<Task>("PATCH", `tasks/${task.id}`, effective);
        setTask(updated);
      } catch (e) {
        setTask(prev);
        setError(e instanceof ApiError ? e.message : "Failed to save changes.");
      } finally {
        setSaving(false);
      }
    },
    [task],
  );

  async function handleDelete() {
    if (!task) return;
    try {
      await apiSend<{ ok: boolean }>("DELETE", `tasks/${task.id}`);
      window.location.href = "/tasks";
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete task.");
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-2/3" />
        <div className="grid gap-6 lg:grid-cols-[1fr_264px]">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-lg font-medium">Task not found</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          This task may have been deleted, or the link is out of date.
        </p>
        <Button render={<a href="/tasks" aria-label="Back to tasks" />} variant="outline">
          <ArrowLeftIcon className="size-4" />
          Back to tasks
        </Button>
      </div>
    );
  }

  if (error && !task) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (!task) {
    return <ErrorState message="Task not found." />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Ancestor trail: "Tasks / <root> / … / <parent> / <current>". */}
      <TaskBreadcrumbs taskId={task.id} title={task.title} />

      <div className="flex items-center justify-between gap-3">
        <a
          href="/tasks"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to tasks
        </a>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="destructive" size="sm">
                <Trash2Icon className="size-4" />
                Delete
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this task?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes “{task.title}”. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDelete}>
                Delete task
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Header: badge pill row + H1 title. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
        </div>
        {editingTitle ? (
          <div className="flex flex-col gap-2">
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              autoFocus
              className="text-lg"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={saving || !titleDraft.trim()}
                onClick={async () => {
                  await patch({ title: titleDraft.trim() });
                  setEditingTitle(false);
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingTitle(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Edit title"
              onClick={() => {
                setTitleDraft(task.title);
                setEditingTitle(true);
              }}
            >
              <PencilIcon className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {error ? <ErrorState message={error} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_264px]">
        {/* Main column (below the sidebar on mobile). */}
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          {/* Description */}
          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Description</CardTitle>
                {!editingDesc ? (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Edit description"
                    onClick={() => {
                      setDescDraft(task.description ?? "");
                      setEditingDesc(true);
                    }}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {editingDesc && mounted ? (
                <div className="flex flex-col gap-2">
                  <TaskRichEditor
                    valueHtml={descDraft}
                    onChangeHtml={setDescDraft}
                    placeholder="Describe this task…"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={async () => {
                        // The editor emits "" for an empty document; store null
                        // so the "No description" empty state renders next time.
                        await patch({ description: descDraft.trim() || null });
                        setEditingDesc(false);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingDesc(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : task.description && htmlToPlainText(task.description).trim() ? (
                // TaskRichHtml is SSR-safe: it shows inert plain text before mount
                // and swaps in DOMPurify-sanitized HTML once hydrated.
                <TaskRichHtml stored={task.description} />
              ) : (
                <p className="text-sm italic text-muted-foreground/60">No description</p>
              )}
            </CardContent>
          </Card>

          {/* "Subtasks" card — child tasks drive derived completion: a plain
              "{done}/{total} completed" header, the child list (click → preview
              → viewport), an add-existing typeahead, and a create flow. The
              progress gauge + editor now live solely in the ProgressCard (right
              column). Derived completion still mirrors back so the board / table
              / sidebar / ProgressCard stay in sync. */}
          <TaskSubtasks
            taskId={task.id}
            taskProgress={task.progress}
            onProgressChange={(progress) =>
              setTask((prev) => (prev ? { ...prev, progress } : prev))
            }
          />

          {/* Comments — real thread + composer. */}
          <TaskComments taskId={task.id} />

          {/* Attachments — real list + R2-backed uploader. */}
          <TaskAttachments taskId={task.id} />
        </div>

        {/* Sidebar (above the main column on mobile). ProgressCard sits FIRST,
            directly above the Properties card. */}
        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <ProgressCard
            progress={task.progress}
            saving={saving}
            onSetProgress={(progress) => patch({ progress })}
          />
          <TaskDetailSidebar task={task} saving={saving} onPatch={patch} />
        </div>
      </div>
    </div>
  );
}
