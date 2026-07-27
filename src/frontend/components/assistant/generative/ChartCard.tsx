/**
 * @fileoverview Generative-UI renderer for the `showChart` ChatBroker tool.
 *
 * Registers (via `makeAssistantToolUI`) a recharts chart for tool-call parts
 * whose `toolName === "showChart"`. Renders a `<ChartContainer>` (the project's
 * shadcn/recharts wrapper) using the OKLCH `--chart-1..5` palette. Supports
 * bar / line / area / pie kinds over a `{ label, value }[]` series.
 */

"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { makeAssistantToolUI } from "@assistant-ui/react";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

import { TOOL_NAMES, type ShowChartArgs, type ShowChartResult } from "./types";

/** The five OKLCH palette hues exposed in global.css as `--chart-1..5`. */
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/** Inner chart body — switches on `kind`. Driven by the `<ChartContainer>` config. */
function ChartBody({ result }: { result: ShowChartResult }) {
  const rows = result.data;

  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis
        dataKey="label"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        className="fill-muted-foreground text-[10px]"
      />
      <YAxis tickLine={false} axisLine={false} width={32} className="fill-muted-foreground text-[10px]" />
      <ChartTooltip content={<ChartTooltipContent />} />
    </>
  );

  switch (result.kind) {
    case "line":
      return (
        <LineChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
          {axes}
          <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
        </LineChart>
      );
    case "area":
      return (
        <AreaChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
          {axes}
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-value)"
            fill="var(--color-value)"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </AreaChart>
      );
    case "pie":
      return (
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
          <Pie data={rows} dataKey="value" nameKey="label" innerRadius={36} strokeWidth={2}>
            {rows.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      );
    case "bar":
    default:
      return (
        <BarChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
          {axes}
          <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
        </BarChart>
      );
  }
}

/** Tool-UI component for `showChart`. Render inside the runtime provider. */
export const ChartToolUI = makeAssistantToolUI<ShowChartArgs, ShowChartResult>({
  toolName: TOOL_NAMES.showChart,
  render: ({ args, result, status }) => {
    const isRunning = status?.type === "running" || (!result && status?.type !== "incomplete");
    const title = result?.title ?? args?.title ?? "Chart";

    if (isRunning && !result) {
      return (
        <div className="my-2 w-full max-w-md animate-pulse rounded-xl bg-card p-4 ring-1 ring-border/40">
          <div className="mb-3 h-4 w-32 rounded bg-muted/60" />
          <div className="h-40 w-full rounded bg-muted/40" />
        </div>
      );
    }

    // Normalise args into a result shape so the chart can render mid-stream.
    const resolved: ShowChartResult = result ?? {
      kind: args?.kind ?? "bar",
      title,
      data: args?.data ?? [],
      series: args?.series ?? null,
    };

    if (resolved.data.length === 0) return null;

    const config: ChartConfig = {
      value: { label: resolved.series ?? "Value", color: PALETTE[0] },
    };

    return (
      <div className="my-2 w-full max-w-md rounded-xl bg-card p-4 ring-1 ring-border/40">
        <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
        <ChartContainer config={config} className="aspect-[16/10] w-full">
          <ChartBody result={resolved} />
        </ChartContainer>
      </div>
    );
  },
});
