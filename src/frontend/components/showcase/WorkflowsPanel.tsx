/**
 * @fileoverview Live interactive panel for the `workflows-agent`.
 *
 * Demonstrates server-driven progress streaming: we subscribe to the agent's
 * synced state via `useAgent({ onStateUpdate })` and render a LIVE
 * {@link WorkflowProgress} view (overall bar + per-step list) that updates as
 * the Durable Object pushes `{ activeWorkflow, lastProgress }`.
 *
 * CRITICAL FIX (React #31): `activeWorkflow` is an OBJECT
 * (`{ workflowId, status, overallProgress, steps, startTime }`). The previous
 * panel typed it as a string and rendered it directly as a React child, which
 * crashed the whole page with "object … is not valid as a React child". This
 * version reads the object's fields explicitly inside {@link WorkflowProgress}
 * and wraps the whole panel in {@link ShowcaseErrorBoundary} so any mid-run
 * failure degrades to a recoverable error card instead of a white screen.
 *
 * The chat thread uses the Wave-1 assistant-ui {@link ThreadProvider} so replies
 * render as markdown (Shiki code blocks, generative cards, reasoning), not raw
 * HTML. Mounted with `client:only="react"` — browser-only agents stack.
 */

"use client";

import { useState } from "react";

import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThreadProvider, type ThreadStatus } from "@/components/assistant/Thread";

import { ConnectionBadge, ErrorBanner, useSessionId } from "./shared";
import { ShowcaseErrorBoundary } from "./ShowcaseErrorBoundary";
import {
  WorkflowProgress,
  type WorkflowProgressEvent,
  type WorkflowStateView,
} from "./WorkflowProgress";

/**
 * Full synced state shape streamed from the workflows-agent Durable Object.
 * `activeWorkflow` is the structured workflow snapshot (NOT a string).
 */
interface WorkflowsState {
  activeWorkflow?: WorkflowStateView | null;
  lastProgress?: WorkflowProgressEvent | null;
}

/** Map a PartySocket `readyState` to the Thread's status vocabulary. */
function statusFromReadyState(readyState: number): ThreadStatus {
  if (readyState === 1) return "connected";
  if (readyState === 0) return "connecting";
  return "disconnected";
}

/** Starter prompts that reliably kick off a real workflow. */
const WELCOME_SUGGESTIONS = [
  "Transcribe an audio URL: https://example.com/talk.mp3",
  "Process a dataset from a URL as CSV",
  "Run a data pipeline and stream the step progress",
];

/**
 * Workflows showcase: a live, object-safe progress stepper bound to
 * `onStateUpdate`, plus a Wave-1 chat thread that drives the workflow tools.
 */
export function WorkflowsPanel() {
  const sessionId = useSessionId("workflows");
  const [state, setState] = useState<WorkflowsState>({});
  const [error, setError] = useState<string | null>(null);

  const agent = useAgent<WorkflowsState>({
    agent: "workflows-agent",
    name: sessionId,
    onStateUpdate: (next) => {
      // Defensive: only accept object-shaped frames; never let a bad frame throw.
      try {
        setState(next && typeof next === "object" ? next : {});
      } catch {
        setState({});
      }
    },
  });
  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat);
  const status = statusFromReadyState(agent.readyState);

  const workflow = state.activeWorkflow ?? null;

  /** On-demand poll of the active workflow's progress via RPC. */
  async function refreshProgress() {
    if (!workflow?.workflowId) return;
    setError(null);
    try {
      const res = await agent.call<WorkflowStateView>("getWorkflowProgress", [workflow.workflowId]);
      if (res) setState((prev) => ({ ...prev, activeWorkflow: res }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read workflow progress.");
    }
  }

  return (
    <ShowcaseErrorBoundary label="The workflows panel hit an error while streaming.">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Live progress */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
            <div>
              <CardTitle>Live workflow progress</CardTitle>
              <CardDescription>
                Streamed from the Durable Object via{" "}
                <code className="text-primary">onStateUpdate</code>.
              </CardDescription>
            </div>
            <ConnectionBadge status={status} sessionId={sessionId} />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <WorkflowProgress workflow={workflow} lastProgress={state.lastProgress} />

            {workflow?.workflowId && (
              <Button
                size="sm"
                variant="outline"
                onClick={refreshProgress}
                disabled={status !== "connected"}
                className="self-start"
              >
                Check progress
              </Button>
            )}

            <ErrorBanner message={error} />
          </CardContent>
        </Card>

        {/* Chat */}
        <Card className="flex h-[34rem] flex-col">
          <CardHeader className="pb-3">
            <CardTitle>Drive a workflow</CardTitle>
            <CardDescription>
              Tools: <code className="text-primary">transcribeAudio</code>,{" "}
              <code className="text-primary">processData</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <ThreadProvider
              runtime={runtime}
              status={status}
              welcomeTitle="Run a durable workflow"
              welcomeSubtitle="Kick off a multi-step task — progress streams to the left as each step completes."
              welcomeSuggestions={WELCOME_SUGGESTIONS}
              placeholder="e.g. transcribe an audio URL, or process a dataset…"
            />
          </CardContent>
        </Card>
      </div>
    </ShowcaseErrorBoundary>
  );
}
