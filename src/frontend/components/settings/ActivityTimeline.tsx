/**
 * @fileoverview ActivityTimeline — filterable audit trail of recent actions.
 *
 * Reads from `GET /api/activity` (sorted newest-first server-side) with a debounced
 * full-text `q` search plus `entityType` and `actor` filters. Each entry shows
 * the actor avatar, the action verb, a human summary, an entity-type badge, and
 * a relative timestamp. Filter options are derived client-side from the loaded
 * rows so the controls stay populated without extra endpoints.
 *
 * Monolith dark profile: shadcn Card/Select/Avatar/Badge, divided by
 * `divide-border/40`, no traditional 1px borders.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SearchIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { apiGet, ApiError } from "@/lib/api";
import { relativeTime, shortDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Wire types — mirror `selectActivityLogSchema`.
// ---------------------------------------------------------------------------

interface ActivityEntry {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string | number | Date;
}

interface ActivityListResponse {
  data: ActivityEntry[];
  total: number;
  limit: number;
  offset: number;
}

/** Sentinel value used by the Selects to mean "no filter" (Base UI Select
 *  cannot use an empty string item value reliably). */
const ALL = "__all__";

/** Derive up to two initials from an actor display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActivityTimeline() {
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state.
  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState<string>(ALL);
  const [actor, setActor] = useState<string>(ALL);

  // Stable list of filter options accumulated from everything we've loaded so
  // the dropdowns don't collapse when an active filter narrows the result set.
  const [entityTypeOptions, setEntityTypeOptions] = useState<string[]>([]);
  const [actorOptions, setActorOptions] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ActivityListResponse>("activity", {
        q: q || undefined,
        entityType: entityType === ALL ? undefined : entityType,
        actor: actor === ALL ? undefined : actor,
        limit: 100,
      });
      setRows(res.data);
      setTotal(res.total);
      // Accumulate filter options.
      setEntityTypeOptions((prev) =>
        Array.from(new Set([...prev, ...res.data.map((r) => r.entityType)])).sort(),
      );
      setActorOptions((prev) =>
        Array.from(new Set([...prev, ...res.data.map((r) => r.actor)])).sort(),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load activity.");
    } finally {
      setLoading(false);
    }
  }, [q, entityType, actor]);

  // Debounce the query; entityType/actor changes apply immediately (load is in
  // the dep array, so this effect re-runs whenever any filter changes).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  const clearFilters = useCallback(() => {
    setQ("");
    setEntityType(ALL);
    setActor(ALL);
  }, []);

  const hasFilters = q !== "" || entityType !== ALL || actor !== ALL;

  const headerCount = useMemo(
    () => (loading ? "…" : `${rows.length} of ${total}`),
    [loading, rows.length, total],
  );

  return (
    <Card className="bg-card ring-1 ring-border/40">
      <CardHeader className="space-y-1">
        <CardTitle>Activity log</CardTitle>
        <CardDescription>
          Append-only audit trail of recent actions, newest first.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Filters ------------------------------------------------------- */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search summary, action, or actor…"
              className="pl-8"
              aria-label="Search activity"
            />
          </div>
          <Select value={entityType} onValueChange={(v) => typeof v === "string" && setEntityType(v)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by entity type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All entity types</SelectItem>
              {entityTypeOptions.map((et) => (
                <SelectItem key={et} value={et}>
                  {et}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actor} onValueChange={(v) => typeof v === "string" && setActor(v)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by actor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actors</SelectItem>
              {actorOptions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{headerCount} entries</span>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {/* Timeline ------------------------------------------------------ */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg bg-muted/20 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {hasFilters ? "No activity matches these filters." : "No activity recorded yet."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 py-3">
                <Avatar size="sm" className="mt-0.5">
                  <AvatarFallback>{initials(entry.actor)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-foreground">{entry.actor}</span>
                    <span className="text-sm text-muted-foreground">{entry.action}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {entry.entityType}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {entry.summary}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    <time title={shortDate(entry.createdAt)}>{relativeTime(entry.createdAt)}</time>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
