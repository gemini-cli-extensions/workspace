/**
 * @fileoverview HealthPanel — the human-facing health dashboard island.
 *
 * Fetches the live binding/secret/env health probe from `GET /api/gsuite-health`
 * (ported from `core-gsuite-tools`; this Worker's own `/api/health` has a
 * different, D1-persisted-runs shape — see
 * `src/backend/api/routes/gsuite/gsuite-health.ts`), renders an overall status
 * banner plus a card per subsystem (D1, KV, secrets, env vars), supports
 * re-running the checks on demand with a skeleton placeholder while in flight,
 * and offers a one-click "Copy for coding agent" action that wraps the full
 * results in a ready-to-paste fix-it prompt.
 *
 * UX rules honored: shadcn components only, NO browser alert/confirm/prompt, all
 * failures routed through the global `logError`, Monolith dark theme (rings +
 * bg-card, no 1px borders). The copy button flips to a green checkmark on
 * success via the shared {@link CopyButton}.
 */

"use client";

import { ActivityIcon, AlertTriangleIcon, CheckCircle2Icon, RefreshCwIcon, XCircleIcon } from "lucide-react";
import * as React from "react";

import { CopyButton } from "@/components/CopyButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { logError } from "@/lib/error-log";
import { cn } from "@/lib/utils";

/** One subsystem check result (matches `ModuleResult` on the backend). */
type CheckResult = {
  status: "ok" | "fail" | "degraded";
  latencyMs?: number;
  error?: string;
  missing?: string[];
};

/** Full `/api/gsuite-health` response shape. */
type HealthReport = {
  status: "ok" | "fail" | "degraded";
  timestamp: string;
  checks: Record<string, CheckResult>;
};

/** Human labels for the known subsystem keys. */
const CHECK_LABELS: Record<string, string> = {
  d1: "D1 Database",
  kv: "KV (Sessions)",
  secrets: "Secrets Store",
  env: "Environment Vars",
};

type OverallStatus = "ok" | "fail" | "degraded";

/** Map a status to its badge styling + icon. */
function statusVisual(status: OverallStatus) {
  switch (status) {
    case "ok":
      return { label: "Healthy", icon: CheckCircle2Icon, tone: "text-emerald-500", ring: "ring-emerald-500/30" };
    case "degraded":
      return { label: "Degraded", icon: AlertTriangleIcon, tone: "text-amber-500", ring: "ring-amber-500/30" };
    default:
      return { label: "Failing", icon: XCircleIcon, tone: "text-destructive", ring: "ring-destructive/30" };
  }
}

/**
 * Build a ready-to-paste prompt that wraps the current health report so a coding
 * agent can fix any failing checks.
 */
function buildAgentPrompt(report: HealthReport): string {
  return `You are a senior Cloudflare Workers engineer working on this Worker (Hono + Drizzle/D1 + Astro SSR + Cloudflare Agents SDK).

Below is the live health report from \`GET /api/gsuite-health\`. Investigate and FIX every check whose status is not "ok". For each failing/degraded check, identify the root cause and give the exact code or config change.

Health report (captured ${report.timestamp}):
\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`

Where to look by check:
- d1: the \`DB\` D1 binding in wrangler.jsonc, drizzle migrations, and \`src/backend/db/\`.
- kv: the \`SESSIONS\` KV binding in wrangler.jsonc.
- secrets: a Secrets Store binding name vs \`secret_name\` mismatch, or a secret missing from the store. Check the probe names in \`src/backend/utils/health.ts\` against the \`secrets_store_secrets\` bindings in wrangler.jsonc.
- env: a required var listed in \`checkEnvVars\` (\`src/backend/utils/health.ts\`) that is missing from wrangler.jsonc \`vars\`. Either add the var or drop it from the required list if unused.

After any wrangler.jsonc binding change run \`pnpm exec wrangler types\`. Return a concrete, file-by-file fix plan, then apply it.`;
}

/** A single subsystem result card. */
function CheckCard({ name, result }: { name: string; result: CheckResult }) {
  const visual = statusVisual(result.status);
  const Icon = visual.icon;
  return (
    <Card className={cn("bg-card ring-1 ring-border/40", visual.ring)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">{CHECK_LABELS[name] ?? name}</CardTitle>
        <Icon className={cn("size-4 shrink-0", visual.tone)} />
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant={result.status === "ok" ? "secondary" : "destructive"} className="gap-1">
            {result.status}
          </Badge>
          {typeof result.latencyMs === "number" ? (
            <span className="text-xs text-muted-foreground">{result.latencyMs}ms</span>
          ) : null}
        </div>
        {result.missing?.length ? (
          <div className="text-xs text-muted-foreground">
            Missing:{" "}
            <span className="font-mono text-foreground">{result.missing.join(", ")}</span>
          </div>
        ) : null}
        {result.error ? (
          <p className="text-xs break-words text-destructive">{result.error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Skeleton grid shown while a probe is in flight. */
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function HealthPanel() {
  const [report, setReport] = React.useState<HealthReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  const runChecks = React.useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/gsuite-health", {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`/api/gsuite-health returned ${res.status} ${res.statusText}`);
      const data = (await res.json()) as HealthReport;
      setReport(data);
    } catch (error) {
      setFailed(true);
      logError({
        title: "Health check failed",
        message: "Could not load the health report from /api/gsuite-health.",
        detail: error,
        source: "HealthPanel.runChecks",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const overall = report?.status ?? "fail";
  const visual = statusVisual(overall);
  const OverallIcon = visual.icon;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <ActivityIcon className="size-5" /> Service Health
          </h1>
          <p className="text-sm text-muted-foreground">
            Live binding, secret, and environment probes. Re-run on demand.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => void runChecks()} disabled={loading}>
            <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
            {loading ? "Running…" : "Run checks"}
          </Button>
          {report ? (
            <CopyButton
              label="Copy for coding agent"
              copiedLabel="Copied"
              text={buildAgentPrompt(report)}
            />
          ) : null}
        </div>
      </div>

      {loading && !report ? (
        <LoadingSkeleton />
      ) : failed && !report ? (
        <Card className="bg-card ring-1 ring-destructive/30">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Could not load the health report. Use “Run checks” to retry — details were logged to the
            error console.
          </CardContent>
        </Card>
      ) : report ? (
        <>
          {/* Overall status banner */}
          <Card className={cn("bg-card ring-1", visual.ring)}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <OverallIcon className={cn("size-6", visual.tone)} />
                <div>
                  <div className={cn("text-base font-semibold", visual.tone)}>{visual.label}</div>
                  <div className="text-xs text-muted-foreground">
                    Last checked {new Date(report.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
              {loading ? (
                <RefreshCwIcon className="size-4 animate-spin text-muted-foreground" />
              ) : null}
            </CardContent>
          </Card>

          {/* Per-subsystem cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(report.checks).map(([name, result]) => (
              <CheckCard key={name} name={name} result={result} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
