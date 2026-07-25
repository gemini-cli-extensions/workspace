/**
 * @fileoverview AdminDashboard — the top-level React island for /dashboard.
 *
 * Owns the shared {@link DashboardFilters} state (search / range / status) and
 * fans it out to every data hook. The search box updates instantly for the
 * user but is debounced before it reaches the network, so charts and stats are
 * not re-fetched on every keystroke.
 *
 * Layout (all responsive, single-column on mobile):
 *   ┌ FilterBar ────────────────────────────────────────────┐
 *   ┌ StatCards (1 → 2 → 3 → 6 columns) ────────────────────┐
 *   ┌ InsightsPanel (Workers AI) ────────────┐┌ RecentActivity ┐
 *   ┌ ChartsGrid (5 recharts variations) ───────────────────┐
 *
 * Every panel handles its own LOADING / ERROR / EMPTY state; nothing here uses
 * mock data or `window.alert`. All errors are rendered inline from the
 * `ApiError` message carried by the shared fetch client.
 */

"use client";

import { useMemo, useState } from "react";

import { AdminDashboardChrome } from "./AdminDashboardChrome";
import type { DashboardFilters, RangeValue, StatusValue } from "./types";
import {
  useActivity,
  useCharts,
  useDebounced,
  useInsights,
  useStats,
} from "./useDashboardData";

export function AdminDashboard() {
  // Raw, instant-feedback filter inputs.
  const [q, setQ] = useState("");
  const [range, setRange] = useState<RangeValue>("30d");
  const [status, setStatus] = useState<StatusValue>("all");

  // The search term that actually reaches the network is debounced.
  const debouncedQ = useDebounced(q, 350);

  const filters: DashboardFilters = useMemo(
    () => ({ q: debouncedQ, range, status }),
    [debouncedQ, range, status],
  );

  const stats = useStats(filters);
  const charts = useCharts(filters);
  const insights = useInsights(filters);
  const activity = useActivity(filters, 8);

  // Reload every panel — used after seeding demo data.
  function reloadAll() {
    stats.reload();
    charts.reload();
    insights.reload();
    activity.reload();
  }

  return (
    <AdminDashboardChrome
      q={q}
      range={range}
      status={status}
      onQChange={setQ}
      onRangeChange={setRange}
      onStatusChange={setStatus}
      stats={stats}
      charts={charts}
      insights={insights}
      activity={activity}
      onSeeded={reloadAll}
    />
  );
}
