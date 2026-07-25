/**
 * @fileoverview SeedBanner — one-click demo-data seeding for the empty dashboard.
 *
 * Shown only when the dashboard has loaded and there is genuinely no data yet
 * (no projects and no tasks). Posts to the idempotent `POST /api/seed` endpoint,
 * then calls `onSeeded()` so the parent reloads every dashboard resource. Makes
 * the template feel alive on first run without forcing a curl command.
 */

"use client";

import { useState } from "react";
import { DatabaseIcon, Loader2Icon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, apiSend } from "@/lib/api";

import type { DashboardStats } from "./types";
import type { Resource } from "./useDashboardData";

type SeedResult = { seeded: boolean; message: string };

export function SeedBanner({
  stats,
  onSeeded,
}: {
  stats: Resource<DashboardStats>;
  onSeeded: () => void;
}) {
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only surface once we know the workspace is actually empty.
  const isEmpty =
    !stats.loading &&
    !stats.error &&
    stats.data !== null &&
    stats.data.totalProjects === 0 &&
    stats.data.totalTasks === 0;

  if (!isEmpty) return null;

  async function seed() {
    setSeeding(true);
    setError(null);
    try {
      await apiSend<SeedResult>("POST", "/seed");
      onSeeded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to seed demo data.");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <Card className="bg-card ring-1 ring-border/40">
      <CardContent className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <DatabaseIcon className="size-5" />
          </div>
          <div>
            <p className="font-medium">Your workspace is empty</p>
            <p className="text-sm text-muted-foreground">
              Seed sample projects, tasks, activity, and notifications to see every
              chart, the realtime feed, and the Workers&nbsp;AI insights in action.
            </p>
            {error && <p className="mt-1 text-sm text-rose-400">{error}</p>}
          </div>
        </div>
        <Button onClick={seed} disabled={seeding} className="shrink-0 gap-2">
          {seeding ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SparklesIcon className="size-4" />
          )}
          {seeding ? "Seeding…" : "Seed demo data"}
        </Button>
      </CardContent>
    </Card>
  );
}
