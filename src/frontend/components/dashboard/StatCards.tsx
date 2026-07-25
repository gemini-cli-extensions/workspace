/**
 * @fileoverview KPI row for the Admin Dashboard — gauges + numeric stat cards.
 *
 * Upgraded to a real product-dashboard hierarchy (mirroring the shadcn
 * "gauges" + "dashboards/home" blocks) in the Monolith dark system:
 *
 *   ┌ Completion Rate ┐┌ Active Ratio ┐┌ ── numeric KPI grid (2×2) ── ┐
 *   │  RadialGauge    ││  RadialGauge ││ Total Projects · Total Tasks │
 *   │  (completion %) ││  (active %)  ││ Completed Tasks · Overdue    │
 *   └─────────────────┘└──────────────┘└──────────────────────────────┘
 *
 * Every value is derived from REAL `GET /api/dashboard/stats` fields — the two
 * gauges visualise the two genuine *ratio* metrics the API exposes (completion
 * rate, and active-vs-total project share). The four numeric cards each carry a
 * coloured icon chip and a contextual subtext. No mock data, no `window.alert`.
 *
 * Monolith styling: `bg-card` surfaces with `ring-1 ring-border/40` (never a
 * traditional 1px border). LOADING swaps the whole row for matching skeletons;
 * ERROR surfaces inline with a retry.
 */

"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { RadialGauge } from "./RadialGauge";
import { InlineError } from "./shared";
import type { DashboardStats } from "./types";
import type { Resource } from "./useDashboardData";

// ---------------------------------------------------------------------------
// Numeric KPI definitions (the non-ratio metrics)
// ---------------------------------------------------------------------------

interface StatDef {
  key: string;
  label: string;
  icon: LucideIcon;
  value: (s: DashboardStats) => string;
  subtext: (s: DashboardStats) => string;
  /** Accent drawn from the chart palette. */
  accent: string;
  /** Whether the subtext should render in the destructive tone when alerting. */
  alert?: (s: DashboardStats) => boolean;
}

const NUMERIC_STATS: StatDef[] = [
  {
    key: "totalProjects",
    label: "Projects",
    icon: FolderKanban,
    value: (s) => compactNumber(s.totalProjects),
    subtext: (s) => `${compactNumber(s.activeProjects)} active`,
    accent: "var(--chart-1)",
  },
  {
    key: "totalTasks",
    label: "Total Tasks",
    icon: ListTodo,
    value: (s) => compactNumber(s.totalTasks),
    subtext: (s) =>
      `${compactNumber(Math.max(s.totalTasks - s.completedTasks, 0))} open`,
    accent: "var(--chart-3)",
  },
  {
    key: "completedTasks",
    label: "Completed",
    icon: CheckCircle2,
    value: (s) => compactNumber(s.completedTasks),
    subtext: (s) =>
      s.unreadNotifications > 0
        ? `${compactNumber(s.unreadNotifications)} unread alerts`
        : "inbox clear",
    accent: "var(--chart-5)",
  },
  {
    key: "overdueTasks",
    label: "Overdue",
    icon: AlertTriangle,
    value: (s) => compactNumber(s.overdueTasks),
    subtext: (s) => (s.overdueTasks > 0 ? "needs attention" : "all on schedule"),
    accent: "var(--chart-4)",
    alert: (s) => s.overdueTasks > 0,
  },
];

// ---------------------------------------------------------------------------
// Gauge cards
// ---------------------------------------------------------------------------

/** Palette keys accepted by {@link RadialGauge}. */
type ChartKey = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";

/** Resolve a `chart-N` key to its raw CSS variable for the header accent dot. */
const chartVar = (key: ChartKey) => `var(--${key})`;

/** A hero gauge card wrapping a {@link RadialGauge} with a title + footnote. */
function GaugeCard({
  title,
  footnote,
  value,
  max,
  label,
  centerLabel,
  caption,
  chartKey,
}: {
  title: string;
  footnote: string;
  value: number;
  max: number;
  label: string;
  centerLabel?: string;
  caption?: string;
  chartKey: ChartKey;
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col items-center gap-2 p-5">
        <div className="flex w-full items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </span>
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: chartVar(chartKey) }}
            aria-hidden
          />
        </div>
        <RadialGauge
          value={value}
          max={max}
          label={label}
          centerLabel={centerLabel}
          caption={caption}
          chartKey={chartKey}
        />
        <span className="text-center text-xs text-muted-foreground">{footnote}</span>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Numeric card
// ---------------------------------------------------------------------------

function NumericCard({ def, data }: { def: StatDef; data: DashboardStats }) {
  const Icon = def.icon;
  const isAlert = def.alert?.(data) ?? false;
  return (
    <Card className="transition-colors hover:bg-card/80">
      <CardContent className="flex flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {def.label}
          </span>
          <span
            className="flex size-7 items-center justify-center rounded-md ring-1 ring-border/40"
            style={{
              backgroundColor: `color-mix(in oklch, ${def.accent} 14%, transparent)`,
            }}
          >
            <Icon className="size-3.5" style={{ color: def.accent }} aria-hidden />
          </span>
        </div>
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {def.value(data)}
        </span>
        <span
          className={cn(
            "text-xs",
            isAlert ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {def.subtext(data)}
        </span>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function LoadingRow() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <Card className="lg:col-span-1">
        <CardContent className="flex flex-col items-center gap-4 p-5">
          <Skeleton className="h-3 w-24 self-start" />
          <Skeleton className="aspect-square w-[160px] rounded-full" />
          <Skeleton className="h-3 w-28" />
        </CardContent>
      </Card>
      <Card className="lg:col-span-1">
        <CardContent className="flex flex-col items-center gap-4 p-5">
          <Skeleton className="h-3 w-24 self-start" />
          <Skeleton className="aspect-square w-[160px] rounded-full" />
          <Skeleton className="h-3 w-28" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-4 lg:col-span-2">
        {NUMERIC_STATS.map((d) => (
          <Card key={d.key}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="size-7 rounded-md" />
              </div>
              <Skeleton className="h-7 w-14" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function StatCards({ resource }: { resource: Resource<DashboardStats> }) {
  const { data, loading, error, reload } = resource;

  if (error) {
    return <InlineError message={error} onRetry={reload} />;
  }

  if (loading && !data) {
    return <LoadingRow />;
  }

  if (!data) return null;

  // Both gauges visualise genuine ratio fields from /api/dashboard/stats.
  // The active-project ratio arc fills against the real project total, so its
  // endAngle sweeps to (activeProjects / totalProjects) * 360°.
  const activeRatioPct =
    data.totalProjects > 0
      ? Math.round((data.activeProjects / data.totalProjects) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <div className="lg:col-span-1">
        <GaugeCard
          title="Completion Rate"
          footnote={`${compactNumber(data.completedTasks)} of ${compactNumber(data.totalTasks)} tasks done`}
          value={data.completionRatePct}
          max={100}
          label="Completion rate"
          centerLabel={`${data.completionRatePct}%`}
          caption="Completion rate"
          chartKey="chart-2"
        />
      </div>

      <div className="lg:col-span-1">
        <GaugeCard
          title="Active Projects"
          footnote={`${compactNumber(data.activeProjects)} of ${compactNumber(data.totalProjects)} projects active`}
          value={data.activeProjects}
          max={Math.max(data.totalProjects, 1)}
          label="Active projects"
          centerLabel={`${activeRatioPct}%`}
          caption="Active ratio"
          chartKey="chart-1"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
        {NUMERIC_STATS.map((def) => (
          <NumericCard key={def.key} def={def} data={data} />
        ))}
      </div>
    </div>
  );
}
