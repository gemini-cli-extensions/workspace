/**
 * @fileoverview useProjects — shared hook that loads the full project list once
 * and exposes it as filter options + an id→name lookup. Used by TaskFilters,
 * TaskBoard, TaskDetail, the analytics page, and the notes page so a project's
 * display name can be shown wherever only a `projectId` is stored on a record.
 *
 * Errors are intentionally swallowed into `error` (never thrown) so a failed
 * project fetch degrades the filter dropdown to empty rather than blanking the
 * entire host island.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiGet, ApiError } from "@/lib/api";

import type { ListEnvelope, Project } from "./types";

export interface UseProjectsResult {
  projects: Project[];
  /** {value,label} options for FilterSelect, sorted by name. */
  options: { value: string; label: string }[];
  /** Map of projectId → display name. */
  nameById: Map<string, string>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Load every project (up to 200) for use in cross-entity lookups. */
export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<ListEnvelope<Project>>("projects", { sort: "name", limit: 200 })
      .then((res) => {
        if (!cancelled) setProjects(res.data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load projects.");
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

  const options = useMemo(
    () =>
      [...projects]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  return { projects, options, nameById, loading, error, reload };
}
