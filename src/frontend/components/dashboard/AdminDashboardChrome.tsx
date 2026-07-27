/**
 * @fileoverview AdminDashboardChrome — the presentational layout shell.
 *
 * Split out from {@link AdminDashboard} so the stateful island stays thin and
 * this file owns only composition + responsive layout. Receives the filter
 * values, their setters, and the four async resources, then arranges every
 * panel. Purely declarative — no fetching or state of its own.
 */

"use client";

import type { RangeValue, StatusValue } from "./types";
import type {
  ActivityResponse,
  DashboardCharts,
  DashboardInsights,
  DashboardStats,
} from "./types";
import type { Resource } from "./useDashboardData";

import { ChartsGrid } from "./ChartsGrid";
import { FilterBar } from "./FilterBar";
import { InsightsPanel } from "./InsightsPanel";
import { RecentActivity } from "./RecentActivity";
import { SeedBanner } from "./SeedBanner";
import { SectionTitle } from "./shared";
import { StatCards } from "./StatCards";

export interface AdminDashboardChromeProps {
  q: string;
  range: RangeValue;
  status: StatusValue;
  onQChange: (q: string) => void;
  onRangeChange: (range: RangeValue) => void;
  onStatusChange: (status: StatusValue) => void;
  stats: Resource<DashboardStats>;
  charts: Resource<DashboardCharts>;
  insights: Resource<DashboardInsights>;
  activity: Resource<ActivityResponse>;
  /** Called after demo data is seeded — reloads every panel. */
  onSeeded: () => void;
}

export function AdminDashboardChrome({
  q,
  range,
  status,
  onQChange,
  onRangeChange,
  onStatusChange,
  stats,
  charts,
  insights,
  activity,
  onSeeded,
}: AdminDashboardChromeProps) {
  return (
    <div className="flex flex-col gap-8">
      <SeedBanner stats={stats} onSeeded={onSeeded} />

      <FilterBar
        q={q}
        range={range}
        status={status}
        onQChange={onQChange}
        onRangeChange={onRangeChange}
        onStatusChange={onStatusChange}
      />

      <section className="flex flex-col gap-4">
        <SectionTitle>Overview</SectionTitle>
        <StatCards resource={stats} />
      </section>

      {/* Insights (headline) + activity feed: stacked on mobile, 2/3 + 1/3 on xl. */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <InsightsPanel resource={insights} />
        </div>
        <div className="xl:col-span-1">
          <RecentActivity resource={activity} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle>Analytics</SectionTitle>
        <ChartsGrid resource={charts} />
      </section>
    </div>
  );
}
