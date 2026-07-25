/**
 * @fileoverview Time-series chart panels for the dashboard charts grid.
 *
 * Two date-keyed recharts variations, wrapped in `<ChartContainer>` with the
 * Monolith OKLCH palette and high-contrast (foreground) axis text:
 *
 *   - {@link TasksOverTimeArea} — dual gradient Area chart overlaying Created
 *     vs Completed per day. The two series are intentionally NOT stacked so the
 *     reader can compare intake against throughput at a glance (the gap between
 *     the curves is the visual story).
 *   - {@link ThroughputBar} — single-series gradient Bar of completed/day, with
 *     an average reference line so spikes/dips read against the baseline.
 *
 * Dates arrive as `YYYY-MM-DD`; we render them as short month/day ticks. All
 * data comes straight from `GET /api/dashboard/charts` — nothing fabricated.
 */

"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
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

import type { TasksOverTimePoint, ThroughputPoint } from "./types";

const AXIS_TICK = { fill: "hsl(var(--foreground))", fontSize: 12 } as const;

/** `YYYY-MM-DD` → short axis label like "Jun 7" (UTC-safe). */
function shortAxisDate(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ---------------------------------------------------------------------------
// Tasks over time — created vs completed (dual gradient Area, unstacked)
// ---------------------------------------------------------------------------

const OVER_TIME_CONFIG: ChartConfig = {
  created: { label: "Created", color: "var(--chart-1)" },
  completed: { label: "Completed", color: "var(--chart-5)" },
};

export function TasksOverTimeArea({ data }: { data: TasksOverTimePoint[] }) {
  return (
    <ChartContainer config={OVER_TIME_CONFIG} className="aspect-[16/7] w-full">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-created)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-created)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillCompleted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={shortAxisDate}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          allowDecimals={false}
          width={36}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent labelFormatter={(v) => shortAxisDate(String(v))} />}
        />
        <Area
          dataKey="created"
          type="monotone"
          stroke="var(--color-created)"
          fill="url(#fillCreated)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area
          dataKey="completed"
          type="monotone"
          stroke="var(--color-completed)"
          fill="url(#fillCompleted)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}

// ---------------------------------------------------------------------------
// Throughput — completed tasks per day (gradient Bar + average reference line)
// ---------------------------------------------------------------------------

const THROUGHPUT_CONFIG: ChartConfig = {
  value: { label: "Completed", color: "var(--chart-2)" },
};

export function ThroughputBar({ data }: { data: ThroughputPoint[] }) {
  const { max, avg } = useMemo(() => {
    if (data.length === 0) return { max: 0, avg: 0 };
    const values = data.map((d) => d.value);
    const sum = values.reduce((s, v) => s + v, 0);
    return { max: Math.max(...values), avg: sum / values.length };
  }, [data]);

  // Highlight the single best-throughput day with a brighter hue.
  const peak = useMemo(() => Math.max(0, ...data.map((d) => d.value)), [data]);

  return (
    <ChartContainer config={THROUGHPUT_CONFIG} className="aspect-[16/7] w-full">
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="fillThroughput" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.95} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={shortAxisDate}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          allowDecimals={false}
          width={36}
          domain={[0, Math.max(max, 1)]}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent labelFormatter={(v) => shortAxisDate(String(v))} />}
        />
        {avg > 0 ? (
          <ReferenceLine
            y={avg}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            strokeOpacity={0.7}
          />
        ) : null}
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((d) => (
            <Cell
              key={d.date}
              fill={d.value === peak && peak > 0 ? "var(--color-value)" : "url(#fillThroughput)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
