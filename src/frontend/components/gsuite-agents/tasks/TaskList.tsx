/**
 * @fileoverview TaskList — the scheduled-tasks rail on /agent-tasks.
 *
 * Lists GET /api/agent-tasks (`{ data: ScheduledTask[] }`) with per-row actions:
 * Run now, Pause/Resume, Delete (shadcn AlertDialog confirm — never
 * window.confirm). Empty state when none. Errors via fetchJson/logError.
 */

"use client";

import {
  CalendarClockIcon,
  ListChecksIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deleteScheduledTask,
  listScheduledTasks,
  pauseScheduledTask,
  resumeScheduledTask,
  runScheduledTask,
  taskAccounts,
  type ScheduledTask,
  type TaskStatus,
} from "@/lib/scheduler-api";
import { cn } from "@/lib/utils";

export type TaskListHandle = { reload: () => void };

function statusBadge(status: TaskStatus) {
  const map: Record<TaskStatus, { variant: "secondary" | "outline" | "destructive"; cls?: string }> =
    {
      active: { variant: "secondary", cls: "text-foreground" },
      paused: { variant: "outline" },
      completed: { variant: "secondary", cls: "text-muted-foreground" },
      error: { variant: "destructive" },
    };
  const cfg = map[status] ?? { variant: "outline" as const };
  return (
    <Badge variant={cfg.variant} className={cn("capitalize", cfg.cls)}>
      {status}
    </Badge>
  );
}

function frequencyLabel(task: ScheduledTask): string {
  switch (task.frequency) {
    case "on_demand":
      return "On demand";
    case "once":
      return "Once";
    case "interval":
      return task.scheduleSpec ? `Every ${task.scheduleSpec}s` : "Interval";
    case "cron":
      return task.scheduleSpec ? `Cron ${task.scheduleSpec}` : "Cron";
    default:
      return task.frequency;
  }
}

function formatTs(ts: number | null | undefined): string {
  if (!ts) return "—";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toLocaleString();
}

export const TaskList = React.forwardRef<TaskListHandle, unknown>(function TaskList(_props, ref) {
  const [tasks, setTasks] = React.useState<ScheduledTask[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ScheduledTask | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await listScheduledTasks());
    } catch {
      setTasks(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useImperativeHandle(ref, () => ({ reload: () => void load() }), [load]);

  const runWith = React.useCallback(
    async (id: string, fn: (id: string) => Promise<void>) => {
      setBusyId(id);
      try {
        await fn(id);
        await load();
      } catch {
        /* logged by fetchJson */
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  if (loading && tasks === null) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-card ring-1 ring-border/40" />
        ))}
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-card py-12 text-center ring-1 ring-border/40">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ListChecksIcon className="size-6" />
        </div>
        <p className="font-medium text-foreground">No scheduled tasks yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Use the wizard above to create your first task — choose an account, an action, and how
          often it should run.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {tasks.map((task) => {
          const accounts = taskAccounts(task);
          const busy = busyId === task.id;
          const isPaused = task.status === "paused";
          return (
            <div
              key={task.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-card p-4 ring-1 ring-border/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/agent-tasks/${encodeURIComponent(task.id)}`}
                    className="truncate font-medium text-foreground hover:underline"
                  >
                    {task.title || "Untitled task"}
                  </a>
                  {statusBadge(task.status)}
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  <span className="font-mono">
                    {task.agent}.{task.action}
                  </span>
                  {accounts.length ? <> · {accounts.join(", ")}</> : null}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClockIcon className="size-3.5" />
                    {frequencyLabel(task)}
                  </span>
                  <span>Next run: {formatTs(task.nextRunAt)}</span>
                  {task.lastRunAt ? <span>Last run: {formatTs(task.lastRunAt)}</span> : null}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void runWith(task.id, runScheduledTask)}
                >
                  <PlayIcon className="size-4" />
                  Run now
                </Button>
                {task.frequency !== "on_demand" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void runWith(task.id, isPaused ? resumeScheduledTask : pauseScheduledTask)
                    }
                  >
                    {isPaused ? (
                      <>
                        <PlayIcon className="size-4" />
                        Resume
                      </>
                    ) : (
                      <>
                        <PauseIcon className="size-4" />
                        Pause
                      </>
                    )}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  aria-label={`Delete ${task.title || "task"}`}
                  onClick={() => setDeleteTarget(task)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.title || "Untitled task"}” will be removed and any schedule cancelled. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => {
                if (deleteTarget) {
                  const id = deleteTarget.id;
                  setDeleteTarget(null);
                  void runWith(id, deleteScheduledTask);
                }
              }}
            >
              <Trash2Icon className="size-4" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
