/**
 * @fileoverview useTaskFacets — derives the faceted-filter vocabulary for the
 * Tasks filter bar from real data (`GET /api/tasks`):
 *
 *   - the distinct, sorted `assignees[]` and `labels[]` (so the Assignee and
 *     Label facets present an actual multi-select list, not a free-text input);
 *   - a per-option `counts` map for EVERY facet dimension (status, priority,
 *     assignee, label, project) so each option row can show how many of the
 *     currently-loaded tasks match it — the Linear-style "N" count.
 *
 * It fetches an unfiltered wide page of tasks once (limit 200) and reduces them.
 * The counts are computed over this full set (i.e. they reflect the total corpus,
 * not the currently-filtered view) so the numbers stay stable while the user
 * toggles facets — matching the devl.dev reference behavior. Errors are swallowed
 * into `error` (never thrown) so a failed fetch degrades the facets to empty
 * rather than blanking the host island — matching the {@link useProjects}
 * contract.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiGet, ApiError } from "@/lib/api";

import type { ListEnvelope, Task } from "./types";

/** A per-value occurrence count for a single facet dimension. */
export type FacetCounts = Record<string, number>;

/** All facet dimensions' per-option counts, keyed by facet name. */
export interface TaskFacetCounts {
  status: FacetCounts;
  priority: FacetCounts;
  assignee: FacetCounts;
  label: FacetCounts;
  projectId: FacetCounts;
}

export interface UseTaskFacetsResult {
  /** Distinct assignee display names, sorted A→Z. */
  assignees: string[];
  /** Distinct labels across all tasks, sorted A→Z. */
  labels: string[];
  /** Per-option occurrence counts for every facet dimension. */
  counts: TaskFacetCounts;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Increment `map[key]` (creating it at 0 first). */
function bump(map: FacetCounts, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * Load a wide page of tasks and reduce them to distinct assignee + label lists
 * plus per-option counts for the faceted filters.
 */
export function useTaskFacets(): UseTaskFacetsResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<ListEnvelope<Task>>("tasks", { limit: 200, sort: "createdAt" })
      .then((res) => {
        if (!cancelled) setTasks(res.data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load task facets.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => reload(), [reload]);

  const assignees = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.assignee && t.assignee.trim()) set.add(t.assignee.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const labels = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      for (const l of t.labels ?? []) {
        if (l && l.trim()) set.add(l.trim());
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const counts = useMemo<TaskFacetCounts>(() => {
    const status: FacetCounts = {};
    const priority: FacetCounts = {};
    const assignee: FacetCounts = {};
    const label: FacetCounts = {};
    const projectId: FacetCounts = {};
    for (const t of tasks) {
      bump(status, t.status);
      bump(priority, t.priority);
      if (t.assignee && t.assignee.trim()) bump(assignee, t.assignee.trim());
      if (t.projectId) bump(projectId, t.projectId);
      for (const l of t.labels ?? []) {
        if (l && l.trim()) bump(label, l.trim());
      }
    }
    return { status, priority, assignee, label, projectId };
  }, [tasks]);

  return { assignees, labels, counts, loading, error, reload };
}
