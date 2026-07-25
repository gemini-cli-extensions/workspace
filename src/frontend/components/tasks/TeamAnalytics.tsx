/**
 * @fileoverview TeamAnalytics — the `/analytics` island (hextaui "team-analytics").
 * Loads `GET /api/tasks` and `GET /api/projects` (up to 200 each) and aggregates
 * client-side into:
 *   - summary cards (total tasks, completion %, active projects, overdue)
 *   - a "tasks by status" breakdown with proportional bars
 *   - a "tasks by priority" breakdown
 *   - a per-project task-count + completion list
 *
 * Intentionally lighter than the full admin dashboard: no chart library, just
 * proportional bars built from the same ring/bg Monolith vocabulary.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2Icon, FolderIcon, ListChecksIcon, TimerIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { EmptyState, ErrorState } from "./Shared";
import {
  BOARD_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type ListEnvelope,
  type Project,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "./types";

const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];

/** Color classes for the proportional status/priority bars (dark-tuned). */
const STATUS_BAR: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/40",
  in_progress: "bg-sky-400",
  in_review: "bg-violet-400",
  done: "bg-emerald-400",
};
const PRIORITY_BAR: Record<TaskPriority, string> = {
  low: "bg-muted-foreground/40",
  medium: "bg-sky-400",
  high: "bg-amber-400",
  urgent: "bg-rose-400",
};

export function TeamAnalytics() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, p] = await Promise.all([
        apiGet<ListEnvelope<Task>>("tasks", { limit: 200 }),
        apiGet<ListEnvelope<Project>>("projects", { limit: 200 }),
      ]);
      setTasks(t.data);
      setProjects(p.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const byStatus: Record<TaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      in_review: 0,
      done: 0,
    };
    const byPriority: Record<TaskPriority, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    let overdue = 0;
    const now = Date.now();
    const perProject = new Map<string, { total: number; done: number }>();

    for (const t of tasks) {
      byStatus[t.status] += 1;
      byPriority[t.priority] += 1;
      if (t.dueDate != null && t.status !== "done") {
        const due = typeof t.dueDate === "number" ? t.dueDate : new Date(t.dueDate).getTime();
        if (!Number.isNaN(due) && due < now) overdue += 1;
      }
      if (t.projectId) {
        const agg = perProject.get(t.projectId) ?? { total: 0, done: 0 };
        agg.total += 1;
        if (t.status === "done") agg.done += 1;
        perProject.set(t.projectId, agg);
      }
    }

    const total = tasks.length;
    const completion = total > 0 ? Math.round((byStatus.done / total) * 100) : 0;
    const activeProjects = projects.filter((p) => p.status === "active").length;

    const projectRows = projects
      .map((p) => {
        const agg = perProject.get(p.id) ?? { total: p.taskCount, done: 0 };
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          total: agg.total,
          done: agg.done,
          pct: agg.total > 0 ? Math.round((agg.done / agg.total) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    return { byStatus, byPriority, overdue, total, completion, activeProjects, projectRows };
  }, [tasks, projects]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (stats.total === 0 && projects.length === 0) {
    return (
      <EmptyState
        icon={<ListChecksIcon />}
        title="Nothing to analyze yet"
        description="Create projects and tasks to populate these metrics."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard icon={<ListChecksIcon />} label="Total tasks" value={stats.total} />
        <SummaryCard
          icon={<CheckCircle2Icon />}
          label="Completion"
          value={`${stats.completion}%`}
        />
        <SummaryCard icon={<FolderIcon />} label="Active projects" value={stats.activeProjects} />
        <SummaryCard
          icon={<TimerIcon />}
          label="Overdue"
          value={stats.overdue}
          emphasis={stats.overdue > 0 ? "warn" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tasks by status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tasks by status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {BOARD_STATUSES.map((s) => (
              <BreakdownRow
                key={s}
                label={STATUS_LABELS[s]}
                count={stats.byStatus[s]}
                total={stats.total}
                barClass={STATUS_BAR[s]}
              />
            ))}
          </CardContent>
        </Card>

        {/* Tasks by priority */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tasks by priority</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {PRIORITIES.map((p) => (
              <BreakdownRow
                key={p}
                label={PRIORITY_LABELS[p]}
                count={stats.byPriority[p]}
                total={stats.total}
                barClass={PRIORITY_BAR[p]}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Per-project completion */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Per-project tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.projectRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects to report on.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/40">
              {stats.projectRows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <a
                    href={`/tasks?projectId=${encodeURIComponent(row.id)}`}
                    className="min-w-0 flex-1 truncate text-sm hover:underline"
                  >
                    {row.name}
                  </a>
                  <div className="hidden w-40 sm:block">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                    {row.done}/{row.total} done
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  emphasis,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  emphasis?: "warn";
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground [&>svg]:size-4">
          {icon}
          {label}
        </span>
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums",
            emphasis === "warn" && "text-amber-300",
          )}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function BreakdownRow({
  label,
  count,
  total,
  barClass,
}: {
  label: string;
  count: number;
  total: number;
  barClass: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {count} · {pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
