/**
 * @fileoverview RadialGauge — a shadcn "radial chart with text" KPI gauge.
 *
 * A faithful repurpose of the shadcn `ChartRadialText` block into the Monolith
 * dark system: a single `RadialBarChart` whose arc sweeps from `startAngle={0}`
 * to an `endAngle` that is *driven by the real metric*, with a bold value and a
 * caption rendered dead-center via a `PolarRadiusAxis` `<Label>`.
 *
 * ── endAngle mapping ──────────────────────────────────────────────────────
 * The gauge is proportional to `value / max` (both supplied by the caller from
 * REAL `/api/dashboard/stats` fields). The fraction is clamped to [0, 1] then
 * mapped onto a full 360° sweep:
 *
 *     fraction = clamp(value / max, 0, 1)
 *     endAngle = fraction * 360        // 0 → empty ring, 360 → full ring
 *
 * So a 72% completion rate (value=72, max=100) sweeps to 259.2° and the center
 * reads "72%". A 3-of-4 active-project ratio (value=3, max=4) sweeps to 270°.
 * The displayed center number is percentage-based by default (`fraction*100`),
 * overridable via `centerLabel` for count-style gauges.
 *
 * Design rules honoured:
 *   - recharts ONLY, wrapped in `<ChartContainer>` (no Chart.js/Plotly/etc.).
 *   - The filled arc colour comes from the OKLCH `--chart-1..5` palette, routed
 *     through the ChartConfig `--color-<key>` variable so it themes correctly.
 *   - Center text is forced to `fill-foreground` / `fill-muted-foreground`.
 *   - No 1px borders; the gauge lives inside a `bg-card` / ring-based shell.
 *
 * The gauge is purely presentational — no data is fabricated here.
 */

"use client";

import { useMemo } from "react";
import {
  Label,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

export interface RadialGaugeProps {
  /** The real metric numerator (e.g. completed tasks, active projects, 0–100 %). */
  value: number;
  /** The metric denominator the arc fills against. Defaults to 100 (percentage). */
  max?: number;
  /** Human label for the series (drives the ChartConfig / tooltip label). */
  label?: string;
  /** Small caption under the big center number (e.g. "Completion rate"). */
  caption?: string;
  /**
   * Palette key selecting the arc colour: `chart-1`…`chart-5`. Routed through
   * `var(--color-<chartKey>)` so it inherits the OKLCH Monolith palette.
   */
  chartKey?: "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";
  /**
   * Override for the big center text. Defaults to the rounded percentage of
   * `value / max` (e.g. "72%"). Pass a count string for count-style gauges.
   */
  centerLabel?: string;
  /** Tailwind sizing for the chart box (matches the shadcn reference default). */
  className?: string;
}

/**
 * A radial-text gauge. The arc length reflects `value / max`; the center shows
 * the metric (percentage by default) above an optional caption.
 */
export function RadialGauge({
  value,
  max = 100,
  label = "Value",
  caption,
  chartKey = "chart-1",
  centerLabel,
  className = "mx-auto aspect-square max-h-[250px]",
}: RadialGaugeProps) {
  const fraction = useMemo(() => {
    const denom = max === 0 ? 1 : max;
    return Math.max(0, Math.min(1, value / denom));
  }, [value, max]);

  // endAngle is driven by the REAL metric: 0 → 360 as fraction goes 0 → 1.
  const endAngle = useMemo(() => fraction * 360, [fraction]);

  const config = useMemo<ChartConfig>(
    () => ({ value: { label, color: `var(--${chartKey})` } }),
    [label, chartKey],
  );

  const data = useMemo(
    () => [{ name: label, value, fill: "var(--color-value)" }],
    [label, value],
  );

  const display = centerLabel ?? `${Math.round(fraction * 100)}%`;

  return (
    <ChartContainer config={config} className={className}>
      <RadialBarChart
        data={data}
        startAngle={0}
        endAngle={endAngle}
        innerRadius={80}
        outerRadius={90}
      >
        <PolarGrid
          gridType="circle"
          radialLines={false}
          stroke="none"
          className="first:fill-muted last:fill-background"
          polarRadius={[86, 74]}
        />
        <RadialBar dataKey="value" background cornerRadius={10} />
        <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox)) return null;
              const { cx, cy } = viewBox as { cx: number; cy: number };
              return (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan
                    x={cx}
                    y={caption ? cy : cy}
                    className="fill-foreground text-4xl font-bold"
                  >
                    {display}
                  </tspan>
                  {caption ? (
                    <tspan x={cx} y={cy + 24} className="fill-muted-foreground">
                      {caption}
                    </tspan>
                  ) : null}
                </text>
              );
            }}
          />
        </PolarRadiusAxis>
      </RadialBarChart>
    </ChartContainer>
  );
}
