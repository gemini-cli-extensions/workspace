/**
 * @fileoverview DiagnosticsPanel — Real-time system health visualization.
 *
 * Reads the latest run from `GET /api/health` and exposes a trigger button
 * for `POST /api/health/run` (which iterates every Durable Object agent
 * binding, opens a stub, pings it, and persists latency + status per check
 * to `health_results`).
 *
 * Themed with the Monolith profile: dark by default, shadcn Card primitives
 * (ring-based separation, no traditional borders), path alias imports
 * through `@/components/...`.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type HealthRun = {
  id: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  trigger: "manual" | "scheduled" | "agent";
  durationMs: number;
  createdAt: string | Date;
  metadata?: Record<string, unknown> | null;
};

type HealthResult = {
  id: string;
  runId: string;
  category: string;
  name: string;
  status: "ok" | "warn" | "fail" | "skipped" | "timeout";
  message?: string | null;
  details?: Record<string, unknown> | null;
  durationMs: number;
  aiSuggestion?: string | null;
  timestamp: string | Date;
};

type HealthPayload = {
  run: HealthRun | null;
  results: HealthResult[];
};

const STATUS_BADGE: Record<HealthRun["status"], "default" | "secondary" | "destructive" | "outline"> = {
  healthy: "default",
  degraded: "secondary",
  unhealthy: "destructive",
  unknown: "outline",
};

const CHECK_BADGE: Record<HealthResult["status"], "default" | "secondary" | "destructive" | "outline"> = {
  ok: "default",
  warn: "secondary",
  fail: "destructive",
  skipped: "outline",
  timeout: "destructive",
};

export function DiagnosticsPanel() {
  const [payload, setPayload] = useState<HealthPayload>({ run: null, results: [] });
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health", { credentials: "include" });
      if (!res.ok) throw new Error(`GET /api/health failed: ${res.status}`);
      const next = (await res.json()) as HealthPayload;
      setPayload(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load health");
    } finally {
      setLoading(false);
    }
  }, []);

  const runChecks = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/health/run", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`POST /api/health/run failed: ${res.status}`);
      const next = (await res.json()) as HealthPayload;
      setPayload(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run health checks");
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grouped = useMemo(() => {
    const map = new Map<string, HealthResult[]>();
    for (const r of payload.results) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    return map;
  }, [payload.results]);

  const totalLatency = useMemo(
    () => payload.results.reduce((sum, r) => sum + r.durationMs, 0),
    [payload.results],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Diagnostics</CardTitle>
            <CardDescription>
              Latest health run. Per-agent Durable Object pings + D1 + Workers AI binding
              checks. Aggregate status, individual latencies, and per-category breakdown.
            </CardDescription>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Button onClick={refresh} disabled={loading || running} size="sm" variant="outline">
              {loading ? "Loading…" : "Refresh"}
            </Button>
            <Button onClick={runChecks} disabled={running || loading} size="sm">
              {running ? "Running…" : "Run checks"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <section
          aria-label="Aggregate status"
          className="grid gap-3 rounded-md bg-muted/30 p-4 ring-1 ring-foreground/5 sm:grid-cols-4"
        >
          <Stat
            label="Status"
            value={
              payload.run ? (
                <Badge variant={STATUS_BADGE[payload.run.status]}>{payload.run.status}</Badge>
              ) : (
                <span className="text-muted-foreground">no runs</span>
              )
            }
          />
          <Stat
            label="Trigger"
            value={payload.run ? payload.run.trigger : "—"}
          />
          <Stat
            label="Total duration"
            value={payload.run ? `${payload.run.durationMs}ms` : "—"}
          />
          <Stat
            label="Sum of check latencies"
            value={`${totalLatency}ms`}
          />
        </section>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {payload.results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No results yet. Click <span className="font-medium">Run checks</span> to populate.
          </p>
        ) : null}

        {[...grouped.entries()].map(([category, results]) => (
          <section key={category} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {category}
            </h3>
            <Separator />
            <ul className="flex flex-col gap-1">
              {results.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{r.name}</p>
                    {r.message ? (
                      <p className="truncate text-xs text-muted-foreground">{r.message}</p>
                    ) : null}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.durationMs}ms
                  </span>
                  <Badge variant={CHECK_BADGE[r.status]}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
