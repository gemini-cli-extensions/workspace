/**
 * @fileoverview TaskDetail — read view for a single scheduled task.
 *
 * Loads GET /api/agent-tasks/:id → `{ data: { ...def, events: [] } }`. Shows the
 * task definition (accounts/action/frequency/indexing) and its run/event
 * timeline. If a run produced a Google file (`googleFileUrl`), shows the
 * read-only preview iframe + "Open in Google"; otherwise it just shows the
 * timeline. Never crashes when there's no file. Errors via fetchJson/logError.
 */

"use client";

import {
  CalendarClockIcon,
  ClockIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getScheduledTask,
  runScheduledTask,
  taskAccounts,
  type ScheduledTaskDetail,
} from "@/lib/scheduler-api";
import { cn } from "@/lib/utils";

const POLL_MS = 4000;

/** Convert a Google file URL into its read-only /preview form when possible. */
function toPreviewUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/\/edit(\?|#|$)/.test(url)) return url.replace(/\/edit.*$/, "/preview");
  return url;
}

function formatTs(ts: number | null | undefined): string {
  if (!ts) return "—";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toLocaleString();
}

function DefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-medium text-foreground break-words">
        {value}
      </span>
    </div>
  );
}

export function TaskDetail({ taskId }: { taskId: string }) {
  const [task, setTask] = React.useState<ScheduledTaskDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [iframeNonce, setIframeNonce] = React.useState(0);

  const load = React.useCallback(async () => {
    try {
      setTask(await getScheduledTask(taskId));
    } catch {
      /* surfaced by ErrorLogger */
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  React.useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const onRun = React.useCallback(async () => {
    setRunning(true);
    try {
      await runScheduledTask(taskId);
      await load();
      setIframeNonce((n) => n + 1);
    } catch {
      /* logged */
    } finally {
      setRunning(false);
    }
  }, [taskId, load]);

  if (loading && !task) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4 lg:p-8">
        <div className="flex items-center gap-3 rounded-xl bg-card p-10 text-sm text-muted-foreground ring-1 ring-border/40">
          <Loader2Icon className="size-4 animate-spin" />
          Loading task…
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4 lg:p-8">
        <div className="rounded-xl bg-card p-10 text-sm text-muted-foreground ring-1 ring-border/40">
          We couldn&apos;t load this task. The error has been logged.{" "}
          <a href="/agent-tasks" className="text-primary underline underline-offset-4">
            Back to tasks
          </a>
          .
        </div>
      </div>
    );
  }

  const accounts = taskAccounts(task);
  const previewUrl = toPreviewUrl(task.googleFileUrl);
  const events = Array.isArray(task.events) ? task.events : [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a href="/agent-tasks" className="text-xs text-muted-foreground hover:underline">
            ← Tasks
          </a>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {task.title || "Untitled task"}
            <Badge variant="secondary" className="capitalize text-foreground">
              {task.status}
            </Badge>
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {task.agent}.{task.action}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCwIcon className="size-4" />
            Refresh
          </Button>
          <Button size="sm" disabled={running} onClick={() => void onRun()}>
            {running ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
            Run now
          </Button>
        </div>
      </div>

      {/* Definition */}
      <div className="divide-y divide-border/40 rounded-xl bg-card px-4 py-1 ring-1 ring-border/40">
        <DefRow label="Accounts" value={accounts.length ? accounts.join(", ") : "—"} />
        <DefRow label="Frequency" value={<FrequencyValue task={task} />} />
        <DefRow label="Next run" value={formatTs(task.nextRunAt)} />
        <DefRow label="Last run" value={formatTs(task.lastRunAt)} />
        {task.promptText || task.prompt ? (
          <DefRow label="Prompt" value={task.promptText ?? task.prompt} />
        ) : null}
        <DefRow label="Index in D1" value={task.indexToD1 ? "Yes" : "No"} />
        <DefRow
          label="RAG corpus"
          value={task.indexVectorizeCorpus ?? "None"}
        />
      </div>

      {/* Preview (only when a run produced a Google file) */}
      {previewUrl ? (
        <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border/40">
          <header className="flex items-center justify-between gap-2 px-4 py-2.5">
            <span className="text-sm font-medium">Latest result</span>
            <a
              href={task.googleFileUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              Open in Google <ExternalLinkIcon className="size-4" />
            </a>
          </header>
          <div className="h-px bg-border/40" />
          <iframe
            key={iframeNonce}
            src={`${previewUrl}${previewUrl.includes("?") ? "&" : "?"}_=${iframeNonce}`}
            title="Google file preview"
            className="h-[60vh] w-full border-0 bg-background"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </section>
      ) : null}

      {/* Run / event timeline */}
      <section className="rounded-xl bg-card px-4 py-4 ring-1 ring-border/40">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <ClockIcon className="size-3.5" /> Run history
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No runs yet. Use “Run now” to execute this task on demand.
          </p>
        ) : (
          <ol className="divide-y divide-border/40">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap gap-3 py-2.5 text-sm">
                <span className="w-36 shrink-0 text-xs text-muted-foreground">
                  {formatTs(event.ts)}
                </span>
                <span className="shrink-0 font-medium text-foreground">{event.type}</span>
                <span className="min-w-0 flex-1 text-muted-foreground">{event.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function FrequencyValue({ task }: { task: ScheduledTaskDetail }) {
  const spec = task.scheduleSpec;
  switch (task.frequency) {
    case "on_demand":
      return (
        <span className="inline-flex items-center gap-1">
          <CalendarClockIcon className="size-3.5" /> On demand
        </span>
      );
    case "once":
      return <span>Once{spec ? ` · ${formatTs(Date.parse(spec))}` : ""}</span>;
    case "interval":
      return <span>Every {spec ?? "?"}s</span>;
    case "cron":
      return <span className="font-mono">Cron {spec ?? ""}</span>;
    default:
      return <span>{task.frequency}</span>;
  }
}
