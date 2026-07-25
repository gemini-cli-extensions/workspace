/**
 * @fileoverview Live interactive panel for the `browser-hitl-agent`.
 *
 * The headline feature is a working human-in-the-loop approval gate: the agent
 * exposes `takeScreenshot` (auto) plus `fillSecureForm` and `clickElement`
 * (both `needsApproval`). When the model calls a gated tool, execution pauses
 * and {@link ApprovalGate} renders Approve / Reject controls wired to
 * `chat.addToolApprovalResponse({ id, approved })`.
 *
 * A side log reads the agent's `@callable getActionLog()` and
 * `getApprovalStats()` RPCs so you can see what actually ran.
 *
 * Mounted with `client:only="react"` — browser-only agents stack.
 */

"use client";

import { type ComponentProps, useCallback, useEffect, useState } from "react";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Thread } from "@/components/assistant/Thread";

import { statusFromReadyState } from "./AgentThread";
import { ApprovalGate } from "./ApprovalGate";
import { ScreenshotToolUI } from "./ScreenshotToolUI";
import { ConnectionBadge, EmptyState, ErrorBanner, LoadingRow, useSessionId } from "./shared";

/**
 * The `runtime` prop type expected by `AssistantRuntimeProvider`. `useAISDKRuntime`
 * resolves against a different `@assistant-ui/core` minor than the provider, so we
 * bridge the (structurally identical) runtime through this type — the same cast
 * the Wave-1 `ThreadProvider` performs.
 */
type RuntimeProp = ComponentProps<typeof AssistantRuntimeProvider>["runtime"];

/** Entry from the agent's `getActionLog()` RPC. */
interface ActionLogEntry {
  action: string;
  detail?: string;
  approved?: boolean;
  at?: number | string;
}

/** Aggregate stats from the agent's `getApprovalStats()` RPC. */
interface ApprovalStats {
  total: number;
  approved: number;
  rejected: number;
}

/** Browser HITL showcase: chat + approval gate + action log. */
export function BrowserHitlPanel() {
  const sessionId = useSessionId("browser-hitl");
  const agent = useAgent({ agent: "browser-hitl-agent", name: sessionId });
  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat);
  const status = statusFromReadyState(agent.readyState);

  // `addToolApprovalResponse` is provided by useAgentChat at runtime but is not
  // surfaced in its public return type (it is spread from the AI SDK chat).
  const respond = (chat as unknown as {
    addToolApprovalResponse: (args: { id: string; approved: boolean }) => void;
  }).addToolApprovalResponse;

  const [log, setLog] = useState<ActionLogEntry[]>([]);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Pull the latest action log + approval stats from the agent. */
  const refreshLog = useCallback(async () => {
    if (agent.readyState !== 1) return;
    setLoadingLog(true);
    setError(null);
    try {
      const [entries, approvalStats] = await Promise.all([
        agent.call<ActionLogEntry[]>("getActionLog"),
        agent.call<ApprovalStats>("getApprovalStats"),
      ]);
      setLog(Array.isArray(entries) ? entries : []);
      setStats(approvalStats ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load action log.");
    } finally {
      setLoadingLog(false);
    }
  }, [agent]);

  // Refresh the log when the connection opens and whenever the turn settles.
  useEffect(() => {
    if (status === "connected") void refreshLog();
  }, [status, refreshLog]);

  useEffect(() => {
    if (!chat.isStreaming && status === "connected") void refreshLog();
    // Re-pull once streaming stops (a tool likely just ran).
  }, [chat.isStreaming, status, refreshLog]);

  return (
    <AssistantRuntimeProvider runtime={runtime as unknown as RuntimeProp}>
      {/* Register the read-only screenshot tool UI (renders nothing until used). */}
      <ScreenshotToolUI />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chat (2 cols) */}
        <Card className="flex h-[34rem] flex-col lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
            <div>
              <CardTitle>Browser agent</CardTitle>
              <CardDescription>
                Tools: <code className="text-primary">takeScreenshot</code>,{" "}
                <code className="text-amber-400">fillSecureForm</code>,{" "}
                <code className="text-amber-400">clickElement</code> (gated).
              </CardDescription>
            </div>
            <ConnectionBadge status={status} sessionId={sessionId} />
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <Thread
              placeholder="e.g. take a screenshot of example.com, then fill the login form…"
              welcomeTitle="Browser automation with approval"
              welcomeSubtitle="Ask the agent to act on a page — read-only screenshots run freely, while dangerous actions pause for your approval."
              welcomeSuggestions={[
                "Take a screenshot of example.com",
                "Fill the login form at example.com with a test email",
                "Click the submit button on example.com",
                "Screenshot example.com full page",
              ]}
              followUpSuggestions={[
                "Now fill the form",
                "Take another screenshot",
                "Click submit",
              ]}
            />
          </CardContent>
        </Card>

        {/* Approval gate + log (1 col) */}
        <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Approval gate</CardTitle>
            <CardDescription>Dangerous actions pause here.</CardDescription>
          </CardHeader>
          <CardContent>
            {respond ? (
              <ApprovalGate messages={chat.messages} respond={respond} />
            ) : (
              <EmptyState label="Approval channel unavailable." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base">Action log</CardTitle>
              <CardDescription>From getActionLog()</CardDescription>
            </div>
            <Button size="xs" variant="ghost" onClick={refreshLog} disabled={status !== "connected"}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{stats.total} total</Badge>
                <Badge variant="default">{stats.approved} approved</Badge>
                <Badge variant="destructive">{stats.rejected} rejected</Badge>
              </div>
            )}

            <ErrorBanner message={error} />

            {loadingLog && log.length === 0 ? (
              <LoadingRow label="Loading action log…" />
            ) : log.length === 0 ? (
              <EmptyState label="No actions recorded yet." />
            ) : (
              <ul className="divide-y divide-border/40 text-xs">
                {log.map((entry, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{entry.action}</p>
                      {entry.detail && (
                        <p className="truncate text-muted-foreground">{entry.detail}</p>
                      )}
                    </div>
                    {entry.approved !== undefined && (
                      <Badge variant={entry.approved ? "default" : "destructive"}>
                        {entry.approved ? "approved" : "rejected"}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
