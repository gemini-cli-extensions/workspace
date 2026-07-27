/**
 * @fileoverview Multi-Agent showcase panel (assistant-ui, nested sub-agents).
 *
 * Retrofitted to the assistant-ui **Multi-Agent pattern**. The panel is the
 * Wave-1 {@link Thread} pointed at the `orchestrator-agent` (an `AIChatAgent`
 * with a `spawnTask` delegation tool). When the orchestrator delegates to a
 * specialist sub-agent, the `spawnTask` tool result carries a `messages` array
 * (the sub-agent's user/assistant turns). {@link SubAgentToolUI} — registered
 * here — renders that conversation **nested** under the tool call, showing
 * "Researcher Agent (working…)" while it runs and the sub-agent thread once it
 * completes.
 *
 * A compact live stats strip reads the orchestrator's `@callable getStats()`
 * RPC (`activeTasks` / `completedTasks` / `failedTasks` / `lastRoutedAgent`).
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Thread } from "@/components/assistant/Thread";

import { statusFromReadyState } from "./AgentThread";
import { SubAgentToolUI } from "./SubAgentToolUI";
import { ConnectionBadge, useSessionId } from "./shared";

/**
 * The `runtime` prop type expected by `AssistantRuntimeProvider`. `useAISDKRuntime`
 * resolves against a different `@assistant-ui/core` minor than the provider, so we
 * bridge the (structurally identical) runtime through this type — the same cast
 * the Wave-1 `ThreadProvider` performs.
 */
type RuntimeProp = ComponentProps<typeof AssistantRuntimeProvider>["runtime"];

/** Aggregate counters from the orchestrator's `getStats()` RPC. */
interface OrchestratorStats {
  activeTasks?: number;
  completedTasks?: number;
  failedTasks?: number;
  lastRoutedAgent?: string;
}

/** Guided starter prompts that exercise both specialists (and delegation). */
const WELCOME_SUGGESTIONS = [
  "Research the tradeoffs of Durable Objects vs KV for session state",
  "Research debouncing and have the coder draft an async debounce function",
  "Have the coder write a TypeScript retry helper with exponential backoff",
  "Compare edge vs origin rendering, then draft a helper to detect the runtime",
];

/**
 * Multi-agent showcase: a live assistant-ui Thread where the orchestrator
 * delegates to researcher/coder sub-agents and their conversations render
 * nested under each delegation tool call.
 */
export function MultiAgentPanel() {
  const sessionId = useSessionId("multi-agent");
  const agent = useAgent({ agent: "orchestrator-agent", name: sessionId });
  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat);
  const status = statusFromReadyState(agent.readyState);

  const [stats, setStats] = useState<OrchestratorStats | null>(null);

  /** Pull aggregate delegation stats from the orchestrator. */
  const refreshStats = useCallback(async () => {
    if (agent.readyState !== 1) return;
    try {
      const res = await agent.call<OrchestratorStats>("getStats");
      setStats(res ?? null);
    } catch {
      // Stats are non-critical; ignore transient errors.
    }
  }, [agent]);

  // Refresh when the connection opens and whenever a turn settles (a delegation
  // likely just ran).
  useEffect(() => {
    if (status === "connected") void refreshStats();
  }, [status, refreshStats]);

  useEffect(() => {
    if (!chat.isStreaming && status === "connected") void refreshStats();
  }, [chat.isStreaming, status, refreshStats]);

  return (
    <AssistantRuntimeProvider runtime={runtime as unknown as RuntimeProp}>
      {/* Register the delegation tool UI (renders nothing until spawnTask runs). */}
      <SubAgentToolUI />

      <Card className="flex h-[calc(100vh-14rem)] min-h-[34rem] flex-col">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle>Orchestrator</CardTitle>
            <CardDescription>
              Delegates to a <code className="text-primary">researcher</code> or{" "}
              <code className="text-primary">coder</code> sub-agent; their conversations
              render nested under each delegation.
            </CardDescription>
          </div>
          <ConnectionBadge status={status} sessionId={sessionId} />
        </CardHeader>

        {/* Live delegation counters. */}
        {stats ? (
          <div className="flex flex-wrap gap-1.5 px-6 pb-2">
            {typeof stats.activeTasks === "number" ? (
              <Badge variant="outline">active: {stats.activeTasks}</Badge>
            ) : null}
            {typeof stats.completedTasks === "number" ? (
              <Badge variant="default">completed: {stats.completedTasks}</Badge>
            ) : null}
            {typeof stats.failedTasks === "number" ? (
              <Badge variant="destructive">failed: {stats.failedTasks}</Badge>
            ) : null}
            {stats.lastRoutedAgent ? (
              <Badge variant="secondary">last: {stats.lastRoutedAgent}</Badge>
            ) : null}
          </div>
        ) : null}

        <CardContent className="min-h-0 flex-1 p-0">
          <Thread
            placeholder="e.g. Research X and have the coder draft a function…"
            welcomeTitle="Multi-agent orchestration"
            welcomeSubtitle="Ask for research, code, or both — the orchestrator routes to a specialist and their reply renders nested under the delegation."
            welcomeSuggestions={WELCOME_SUGGESTIONS}
            followUpSuggestions={[
              "Now have the coder turn that into code",
              "Research a related tradeoff",
              "Summarise both results",
            ]}
          />
        </CardContent>
      </Card>
    </AssistantRuntimeProvider>
  );
}
