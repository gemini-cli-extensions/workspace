/**
 * @fileoverview Data-fetching hooks for the Admin Dashboard.
 *
 * Centralises every network call the dashboard makes so the visual components
 * stay declarative. Each hook:
 *   - fetches through the shared `apiGet` helper (so `ApiError` carries a
 *     human-readable message we can render inline — never `window.alert`);
 *   - exposes `{ data, loading, error, reload }`;
 *   - re-fetches whenever the {@link DashboardFilters} change.
 *
 * Filter values are passed straight through to the API as query params
 * (`q`, `range`, `status`). The backend currently keys off `range`; `q` and
 * `status` are forwarded so the contract is future-proof and the UI is honest
 * about what it is requesting. No mock data ever flows through here.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, apiGet } from "@/lib/api";

import type {
  ActivityResponse,
  DashboardCharts,
  DashboardFilters,
  DashboardInsights,
  DashboardStats,
} from "./types";

/** Generic async-resource shape returned by every dashboard hook. */
export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Imperatively re-run the fetch (used by refresh buttons). */
  reload: () => void;
}

/** Turn filter state into the query-param object every endpoint accepts. */
function filterParams(f: DashboardFilters): Record<string, string> {
  const params: Record<string, string> = { range: f.range };
  if (f.q.trim()) params.q = f.q.trim();
  if (f.status !== "all") params.status = f.status;
  return params;
}

/** Normalise any thrown value into a displayable message. */
function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Request failed";
}

/**
 * Core fetch hook: runs `fetcher` whenever `deps` change, with race-condition
 * protection (stale responses are discarded) and a manual `reload` trigger.
 */
function useResource<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);

  // `fetcher` is intentionally excluded from deps — callers pass an inline
  // closure each render, and `deps` already captures everything it reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    run()
      .then((next) => {
        if (id === reqId.current) setData(next);
      })
      .catch((err) => {
        if (id === reqId.current) setError(messageOf(err));
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload };
}

/** Stat-card aggregates. */
export function useStats(filters: DashboardFilters): Resource<DashboardStats> {
  return useResource(
    () => apiGet<DashboardStats>("dashboard/stats", filterParams(filters)),
    [filters.q, filters.range, filters.status],
  );
}

/** Chart datasets. */
export function useCharts(filters: DashboardFilters): Resource<DashboardCharts> {
  return useResource(
    () => apiGet<DashboardCharts>("dashboard/charts", filterParams(filters)),
    [filters.q, filters.range, filters.status],
  );
}

/** Workers-AI insight paragraph. */
export function useInsights(
  filters: DashboardFilters,
): Resource<DashboardInsights> {
  return useResource(
    () => apiGet<DashboardInsights>("dashboard/insights", filterParams(filters)),
    [filters.q, filters.range, filters.status],
  );
}

/** Recent activity feed (newest first, capped at `limit`). */
export function useActivity(
  filters: DashboardFilters,
  limit = 8,
): Resource<ActivityResponse> {
  return useResource(
    () =>
      apiGet<ActivityResponse>("activity", {
        limit,
        ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
      }),
    [filters.q, limit],
  );
}

/**
 * Debounce a fast-changing value (e.g. a search box) so we do not fire a
 * request on every keystroke. Returns the value after it has been stable for
 * `delay` ms.
 */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
