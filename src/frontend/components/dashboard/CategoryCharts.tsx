/**
 * @fileoverview Categorical chart panels for the dashboard charts grid.
 *
 * Distinct recharts variations, each wrapped in `<ChartContainer>` with the
 * Monolith OKLCH palette (`--chart-1..5`) and high-contrast (foreground) text:
 *
 *   - {@link TasksByStatusDonut}        — donut with a bold center total and an
 *     expanded active slice (the shadcn "donut" block).
 *   - {@link CreatedVsCompletedGrouped} — GROUPED bar chart (the "bar-grouped"
 *     block): Created vs Completed binned into weekly buckets derived from the
 *     real `tasksOverTime` series.
 *   - {@link TasksByPriorityBar}        — vertical bar chart, colour-per-bar.
 *   - {@link ProjectsByStatusBar}       — horizontal bar chart.
 *
 * The `{ name, value }[]` / time-series datasets all come straight from
 * `GET /api/dashboard/charts`. No data is fabricated; the grouped chart only
 * re-buckets data the API already returns. Axis/label text is forced to
 * `hsl(var(--foreground))` per the Monolith chart rules.
 */

"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Label as RechartsLabel,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { compactNumber } from "@/lib/format";

import type { NameValue, TasksOverTimePoint } from "./types";

/** The five-hue palette, indexable for per-slice / per-bar coloring. */
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const AXIS_TICK = { fill: "hsl(var(--foreground))", fontSize: 12 } as const;

/** Build a `ChartConfig` keyed by datum name for legend/tooltip. */
function buildConfig(data: NameValue[]): ChartConfig {
  const cfg: ChartConfig = {};
  data.forEach((d, i) => {
    cfg[d.name] = { label: d.name, color: PALETTE[i % PALETTE.length] };
  });
  return cfg;
}

// ---------------------------------------------------------------------------
// Tasks by status — donut with bold center total + expandable active slice
// ---------------------------------------------------------------------------

export function TasksByStatusDonut({ data }: { data: NameValue[] }) {
  const config = useMemo(() => buildConfig(data), [data]);
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const withFill = useMemo(
    () => data.map((d, i) => ({ ...d, fill: PALETTE[i % PALETTE.length] })),
    [data],
  );

  // Track the hovered slice so it can lift out of the ring ("donut" block feel).
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <ChartContainer config={config} className="mx-auto aspect-square max-h-[260px]">
      <PieChart>
        <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="name" hideLabel />} />
        <Pie
          data={withFill}
          dataKey="value"
          nameKey="name"
          innerRadius={64}
          outerRadius={92}
          paddingAngle={2}
          strokeWidth={2}
          stroke="hsl(var(--background))"
          onMouseEnter={(_, index) => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(null)}
        >
          {withFill.map((d, i) => (
            <Cell
              key={d.name}
              fill={d.fill}
              opacity={activeIndex === null || activeIndex === i ? 1 : 0.45}
            />
          ))}
          <RechartsLabel
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox)) return null;
              const { cx, cy } = viewBox as { cx: number; cy: number };
              const active = activeIndex !== null ? withFill[activeIndex] : null;
              const big = active ? compactNumber(active.value) : compactNumber(total);
              const small = active ? active.name : "total tasks";
              return (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan
                    x={cx}
                    y={cy - 6}
                    className="fill-foreground text-[1.75rem] font-semibold tabular-nums"
                  >
                    {big}
                  </tspan>
                  <tspan x={cx} y={cy + 16} className="fill-muted-foreground text-xs">
                    {small}
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  );
}

// ---------------------------------------------------------------------------
// Created vs Completed — GROUPED bar chart (weekly buckets from tasksOverTime)
// ---------------------------------------------------------------------------

const GROUPED_CONFIG: ChartConfig = {
  created: { label: "Created", color: "var(--chart-1)" },
  completed: { label: "Completed", color: "var(--chart-5)" },
};

interface WeeklyBucket {
  label: string;
  created: number;
  completed: number;
}

/**
 * Collapse a daily `tasksOverTime` series into at most `targetBars` evenly
 * sized buckets, summing created/completed within each. Keeps the grouped bar
 * chart legible regardless of the selected range (7d → 7 bars, 90d → ~12).
 */
function bucketWeekly(points: TasksOverTimePoint[], targetBars = 12): WeeklyBucket[] {
  if (points.length === 0) return [];
  const size = Math.max(1, Math.ceil(points.length / targetBars));
  const buckets: WeeklyBucket[] = [];
  for (let i = 0; i < points.length; i += size) {
    const slice = points.slice(i, i + size);
    const first = slice[0]!.date;
    const created = slice.reduce((s, p) => s + p.created, 0);
    const completed = slice.reduce((s, p) => s + p.completed, 0);
    const d = new Date(`${first}T00:00:00Z`);
    const label = Number.isNaN(d.getTime())
      ? first
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    buckets.push({ label, created, completed });
  }
  return buckets;
}

export function CreatedVsCompletedGrouped({ data }: { data: TasksOverTimePoint[] }) {
  const buckets = useMemo(() => bucketWeekly(data), [data]);

  return (
    <ChartContainer config={GROUPED_CONFIG} className="aspect-[16/7] w-full">
      <BarChart data={buckets} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickMargin={8}
          minTickGap={16}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          allowDecimals={false}
          width={36}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="created" fill="var(--color-created)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}

// ---------------------------------------------------------------------------
// Tasks by priority — vertical bar, color per bar
// ---------------------------------------------------------------------------

export function TasksByPriorityBar({ data }: { data: NameValue[] }) {
  const config = useMemo(() => buildConfig(data), [data]);
  const withFill = useMemo(
    () => data.map((d, i) => ({ ...d, fill: PALETTE[i % PALETTE.length] })),
    [data],
  );

  return (
    <ChartContainer config={config} className="aspect-[4/3] w-full">
      <BarChart data={withFill} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          allowDecimals={false}
          width={32}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {withFill.map((d) => (
            <Cell key={d.name} fill={d.fill} />
          ))}
          <LabelList
            dataKey="value"
            position="top"
            className="fill-foreground"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ---------------------------------------------------------------------------
// Projects by status — horizontal bar
// ---------------------------------------------------------------------------

export function ProjectsByStatusBar({ data }: { data: NameValue[] }) {
  const config = useMemo(() => buildConfig(data), [data]);
  const withFill = useMemo(
    () => data.map((d, i) => ({ ...d, fill: PALETTE[i % PALETTE.length] })),
    [data],
  );

  return (
    <ChartContainer config={config} className="aspect-[4/3] w-full">
      <BarChart
        data={withFill}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
      >
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          width={84}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={36}>
          {withFill.map((d) => (
            <Cell key={d.name} fill={d.fill} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            className="fill-foreground"
            fontSize={11}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
