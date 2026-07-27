/**
 * @fileoverview Shared TypeScript shapes for the Admin Dashboard island.
 *
 * These mirror the exact response schemas served by the backend Hono routers
 * so the island stays in lock-step with the wire contract:
 *   - `GET /api/dashboard/stats`    → {@link DashboardStats}
 *   - `GET /api/dashboard/charts`   → {@link DashboardCharts}
 *   - `GET /api/dashboard/insights` → {@link DashboardInsights}
 *   - `GET /api/activity?limit=8`   → {@link ActivityResponse}
 *
 * Nothing here is fabricated: every field corresponds 1:1 with a Zod schema
 * defined in `src/backend/api/routes/{dashboard,activity}.ts`.
 */

/** Stat-card aggregates from `GET /api/dashboard/stats`. */
export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  /** Completed / total * 100, rounded to 1 dp. */
  completionRatePct: number;
  /** Tasks where dueDate < now AND status != done. */
  overdueTasks: number;
  unreadNotifications: number;
}

/** A simple `{ name, value }` datum used by pie/bar charts. */
export interface NameValue {
  name: string;
  value: number;
}

/** One point on the created-vs-completed time series. */
export interface TasksOverTimePoint {
  /** YYYY-MM-DD. */
  date: string;
  created: number;
  completed: number;
}

/** One point on the throughput (completed per day) bar series. */
export interface ThroughputPoint {
  date: string;
  value: number;
}

/** Chart datasets from `GET /api/dashboard/charts`. */
export interface DashboardCharts {
  tasksByStatus: NameValue[];
  tasksByPriority: NameValue[];
  tasksOverTime: TasksOverTimePoint[];
  projectsByStatus: NameValue[];
  throughput: ThroughputPoint[];
}

/** AI insight payload from `GET /api/dashboard/insights`. */
export interface DashboardInsights {
  /** 2–4 bullet markdown-ish insight string (Workers AI). */
  insight: string;
  /** ISO 8601 timestamp. */
  generatedAt: string;
}

/** One row from the append-only `activity_log` table. */
export interface ActivityEntry {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  /** Epoch ms or ISO string depending on serializer. */
  createdAt: string | number;
}

/** Paginated envelope from `GET /api/activity`. */
export interface ActivityResponse {
  data: ActivityEntry[];
  total: number;
  limit: number;
  offset: number;
}

/** The selectable time window shared by every dashboard query. */
export type RangeValue = "7d" | "30d" | "90d";

/** Task-status filter applied to the stat/chart queries (UI-side narrowing). */
export type StatusValue = "all" | "todo" | "in_progress" | "in_review" | "done";

/** The combined filter state that drives all dashboard fetches. */
export interface DashboardFilters {
  /** Debounced free-text search forwarded as `?q=`. */
  q: string;
  /** Time window forwarded as `?range=`. */
  range: RangeValue;
  /** Status filter forwarded as `?status=`. */
  status: StatusValue;
}
