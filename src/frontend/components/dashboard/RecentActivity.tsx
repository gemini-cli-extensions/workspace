/**
 * @fileoverview Recent activity feed for the dashboard sidebar column.
 *
 * Pulls `GET /api/activity?limit=8` and renders the newest audit-log rows with
 * actor, summary, entity-type badge, and a `relativeTime` timestamp. The list
 * uses `divide-y divide-border/40` for separation (Monolith: no 1px borders)
 * and respects the dashboard search box (forwarded as `?q=`).
 *
 * LOADING shows skeleton rows; ERROR surfaces inline (with retry); EMPTY shows
 * a neutral placeholder.
 */

"use client";

import { Activity as ActivityIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/format";

import { EmptyState, InlineError } from "./shared";
import type { ActivityResponse } from "./types";
import type { Resource } from "./useDashboardData";

/** Map an action verb to a short avatar-style glyph (first letter). */
function initial(actor: string): string {
  return (actor.trim()[0] ?? "?").toUpperCase();
}

export function RecentActivity({
  resource,
}: {
  resource: Resource<ActivityResponse>;
}) {
  const { data, loading, error, reload } = resource;
  const rows = data?.data ?? [];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </div>
        <CardDescription>Latest audit-log events across all entities.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {error ? (
          <InlineError message={error} onRetry={reload} />
        ) : loading && !data ? (
          <ul className="flex flex-col gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-start gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-[80%]" />
                  <Skeleton className="h-3 w-[40%]" />
                </div>
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <EmptyState label="No recent activity." />
        ) : (
          <ScrollArea className="h-[360px] pr-3">
            <ul className="divide-y divide-border/40">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 py-3 first:pt-0">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase text-muted-foreground ring-1 ring-border/40"
                    aria-hidden
                  >
                    {initial(row.actor)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-foreground/90">
                      <span className="font-medium text-foreground">{row.actor}</span>{" "}
                      {row.summary}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {row.entityType}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {relativeTime(row.createdAt)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
