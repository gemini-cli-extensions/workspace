/**
 * @fileoverview Charts grid — composes the dashboard recharts suite.
 *
 * Arranged as a real product-analytics layout (mirroring the shadcn
 * "dashboards/engineering" block) rather than a flat grid:
 *
 *   ┌ Tasks Over Time (hero, full-width area) ───────────────────────────┐
 *   ┌ Created vs Completed (grouped bar, 2/3) ─┐┌ Tasks by Status (donut)┐
 *   ┌ Throughput (bar, 1/3) ┐┌ Priority (bar) ┐┌ Projects (h-bar) ──────┐
 *
 * Every dataset is sourced from `GET /api/dashboard/charts`:
 *   - tasksOverTime → hero Area + (re-bucketed) grouped Bar
 *   - tasksByStatus → donut with center total
 *   - throughput    → throughput Bar
 *   - tasksByPriority → vertical Bar
 *   - projectsByStatus → horizontal Bar
 *
 * The grid collapses to a single column on mobile. Each {@link ChartCard}
 * independently surfaces LOADING / ERROR / EMPTY from the one shared resource.
 */

"use client";

import { ChartCard } from "./ChartCard";
import {
  CreatedVsCompletedGrouped,
  ProjectsByStatusBar,
  TasksByPriorityBar,
  TasksByStatusDonut,
} from "./CategoryCharts";
import { TasksOverTimeArea, ThroughputBar } from "./TimeSeriesCharts";
import type { DashboardCharts } from "./types";
import type { Resource } from "./useDashboardData";

export function ChartsGrid({ resource }: { resource: Resource<DashboardCharts> }) {
  const { data, loading, error, reload } = resource;
  const isLoading = loading && !data;

  /** Curried shell so each panel shares LOADING / ERROR / EMPTY handling. */
  const shell = (
    title: string,
    description: string,
    hasData: boolean,
    body: React.ReactNode,
  ) => (
    <ChartCard
      title={title}
      description={description}
      loading={isLoading}
      error={error}
      onRetry={reload}
      hasData={hasData}
    >
      {body}
    </ChartCard>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Hero: full-width Created vs Completed area trend. */}
      {shell(
        "Tasks Over Time",
        "Created vs. completed per day across the selected range.",
        !!data && data.tasksOverTime.length > 0,
        data ? <TasksOverTimeArea data={data.tasksOverTime} /> : null,
      )}

      {/* Grouped bar (2/3) + status donut (1/3). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {shell(
            "Created vs Completed",
            "Weekly intake against throughput.",
            !!data && data.tasksOverTime.length > 0,
            data ? <CreatedVsCompletedGrouped data={data.tasksOverTime} /> : null,
          )}
        </div>
        <div className="lg:col-span-1">
          {shell(
            "Tasks by Status",
            "Distribution across the workflow.",
            !!data && data.tasksByStatus.length > 0,
            data ? <TasksByStatusDonut data={data.tasksByStatus} /> : null,
          )}
        </div>
      </div>

      {/* Throughput + priority + projects, 3-up on desktop. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {shell(
          "Throughput",
          "Tasks completed per day vs. average.",
          !!data && data.throughput.length > 0,
          data ? <ThroughputBar data={data.throughput} /> : null,
        )}
        {shell(
          "Tasks by Priority",
          "How urgent is the backlog?",
          !!data && data.tasksByPriority.length > 0,
          data ? <TasksByPriorityBar data={data.tasksByPriority} /> : null,
        )}
        {shell(
          "Projects by Status",
          "Portfolio breakdown.",
          !!data && data.projectsByStatus.length > 0,
          data ? <ProjectsByStatusBar data={data.projectsByStatus} /> : null,
        )}
      </div>
    </div>
  );
}
