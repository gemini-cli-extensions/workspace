/**
 * @fileoverview Generative tool-UI renderers for the MCP showcase tools.
 *
 * Registers (via `makeAssistantToolUI`) a dedicated rich card for each of the
 * `McpAgent`'s three tools, so when the model calls `echo` / `currentTime` /
 * `dbCount` inside the Wave-1 assistant-ui `Thread`, the tool-call part renders
 * as a purpose-built card instead of the generic JSON fallback.
 *
 * These result shapes MUST stay in lockstep with the `execute` return values in
 * `src/backend/ai/agents/McpAgent/index.ts`:
 *   - echo        -> { tool: "echo",        message }
 *   - currentTime -> { tool: "currentTime", timezone, iso, formatted }
 *   - dbCount     -> { tool: "dbCount",     table, count }
 *
 * Mount `<McpToolUIs />` once inside the `AssistantRuntimeProvider` (it renders
 * nothing visible) to activate all three renderers. Browser-only.
 */

"use client";

import { ClockIcon, DatabaseIcon, MessagesSquareIcon } from "lucide-react";

import { makeAssistantToolUI } from "@assistant-ui/react";

import { Badge } from "@/components/ui/badge";

/** Single source of truth for MCP tool names (matches the backend catalog). */
export const MCP_TOOL_NAMES = {
  echo: "echo",
  currentTime: "currentTime",
  dbCount: "dbCount",
} as const;

// ---------------------------------------------------------------------------
// Wire-contract types (mirror McpAgent tool `execute` returns).
// ---------------------------------------------------------------------------

interface EchoArgs {
  message: string;
}
interface EchoResult {
  tool: "echo";
  message: string;
}

interface CurrentTimeArgs {
  timezone?: string;
}
interface CurrentTimeResult {
  tool: "currentTime";
  timezone: string;
  iso: string;
  formatted: string;
}

interface DbCountArgs {
  table: "notifications" | "projects" | "tasks";
}
interface DbCountResult {
  tool: "dbCount";
  table: string;
  count: number;
}

/** Shared card chrome for an MCP tool call (Monolith profile, no 1px borders). */
function McpCardShell({
  icon,
  toolName,
  running,
  children,
}: {
  icon: React.ReactNode;
  toolName: string;
  running: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="my-2 w-full max-w-sm rounded-xl bg-card p-4 ring-1 ring-border/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <code className="text-xs font-semibold text-primary">{toolName}</code>
        </div>
        <Badge variant={running ? "secondary" : "default"} className="text-[10px] tracking-wide">
          {running ? "calling" : "MCP tool"}
        </Badge>
      </div>
      {children}
    </div>
  );
}

/** Skeleton shown while a tool is mid-flight and has no result yet. */
function McpCardSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 w-28 rounded bg-muted/60" />
      <div className="h-6 w-40 rounded bg-muted/60" />
    </div>
  );
}

/** `echo` — renders the round-tripped message verbatim. */
export const EchoToolUI = makeAssistantToolUI<EchoArgs, EchoResult>({
  toolName: MCP_TOOL_NAMES.echo,
  render: ({ args, result, status }) => {
    const running = status?.type === "running" && !result;
    const message = result?.message ?? args?.message ?? "";
    return (
      <McpCardShell
        icon={<MessagesSquareIcon className="size-4" />}
        toolName="echo()"
        running={running}
      >
        {running ? (
          <McpCardSkeleton />
        ) : (
          <p className="rounded-md bg-muted/40 px-3 py-2 font-mono text-sm break-words text-foreground">
            {message || <span className="text-muted-foreground">(empty)</span>}
          </p>
        )}
      </McpCardShell>
    );
  },
});

/** `currentTime` — renders the real server clock for the requested timezone. */
export const CurrentTimeToolUI = makeAssistantToolUI<CurrentTimeArgs, CurrentTimeResult>({
  toolName: MCP_TOOL_NAMES.currentTime,
  render: ({ args, result, status }) => {
    const running = status?.type === "running" && !result;
    const timezone = result?.timezone ?? args?.timezone ?? "UTC";
    return (
      <McpCardShell
        icon={<ClockIcon className="size-4" />}
        toolName="currentTime()"
        running={running}
      >
        {running || !result ? (
          <McpCardSkeleton />
        ) : (
          <div className="space-y-1">
            <p className="text-lg font-semibold tracking-tight text-foreground">
              {result.formatted}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="font-mono text-[10px]">
                {timezone}
              </Badge>
              <code className="truncate">{result.iso}</code>
            </div>
          </div>
        )}
      </McpCardShell>
    );
  },
});

/** `dbCount` — renders the live D1 row count for a whitelisted table. */
export const DbCountToolUI = makeAssistantToolUI<DbCountArgs, DbCountResult>({
  toolName: MCP_TOOL_NAMES.dbCount,
  render: ({ args, result, status }) => {
    const running = status?.type === "running" && !result;
    const table = result?.table ?? args?.table ?? "?";
    return (
      <McpCardShell
        icon={<DatabaseIcon className="size-4" />}
        toolName="dbCount()"
        running={running}
      >
        {running || !result ? (
          <McpCardSkeleton />
        ) : (
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                rows in <code className="text-primary">{table}</code>
              </p>
              <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
                {result.count.toLocaleString()}
              </span>
            </div>
            <Badge variant="outline" className="mb-1 font-mono text-[10px]">
              live D1
            </Badge>
          </div>
        )}
      </McpCardShell>
    );
  },
});

/**
 * Registers all MCP tool renderers. Render once inside the runtime provider,
 * beside the `Thread`. Renders nothing visible.
 */
export function McpToolUIs() {
  return (
    <>
      <EchoToolUI />
      <CurrentTimeToolUI />
      <DbCountToolUI />
    </>
  );
}
