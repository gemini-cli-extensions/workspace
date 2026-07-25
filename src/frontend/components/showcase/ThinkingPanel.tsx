/**
 * @fileoverview Live interactive panel for the `thinking-agent`.
 *
 * The agent's `onChatMessage` emits `reasoning-*` parts (the thinking phase)
 * before the final `text-*` parts (the answer). The Wave-1 assistant-ui
 * {@link ThreadProvider} renders reasoning parts in a distinct, muted block
 * ABOVE the answer, and renders the answer as markdown (Shiki code blocks,
 * generative cards). We reuse it directly so the trace + answer both render
 * correctly, with a guided welcome and a prompt that elicits visible reasoning.
 *
 * Mounted with `client:only="react"` — browser-only agents stack.
 */

"use client";

import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThreadProvider, type ThreadStatus } from "@/components/assistant/Thread";

import { ConnectionBadge, useSessionId } from "./shared";
import { ShowcaseErrorBoundary } from "./ShowcaseErrorBoundary";

/** Map a PartySocket `readyState` to the Thread's status vocabulary. */
function statusFromReadyState(readyState: number): ThreadStatus {
  if (readyState === 1) return "connected";
  if (readyState === 0) return "connecting";
  return "disconnected";
}

/** Prompts that reliably produce a substantive, visible reasoning trace. */
const WELCOME_SUGGESTIONS = [
  "If a train leaves at 3pm going 60mph and another at 4pm going 80mph, when do they meet?",
  "Compare optimistic vs pessimistic locking — reason it through, then recommend one.",
  "Plan the steps to migrate a REST API to Durable Objects.",
];

/** Thinking showcase: a chat that surfaces the reasoning trace separately. */
export function ThinkingPanel() {
  const sessionId = useSessionId("thinking");
  const agent = useAgent({ agent: "thinking-agent", name: sessionId });
  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat);
  const status = statusFromReadyState(agent.readyState);

  return (
    <ShowcaseErrorBoundary label="The thinking panel hit an error while streaming.">
      <Card className="flex h-[calc(100vh-18rem)] min-h-[32rem] flex-col">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle>Reasoning trace</CardTitle>
            <CardDescription>
              The model streams its reasoning first (a distinct block), then the answer as markdown.
            </CardDescription>
          </div>
          <ConnectionBadge status={status} sessionId={sessionId} />
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <ThreadProvider
            runtime={runtime}
            status={status}
            welcomeTitle="Watch the model think"
            welcomeSubtitle="Ask something that needs reasoning — you'll see the thinking trace, then the answer."
            welcomeSuggestions={WELCOME_SUGGESTIONS}
            placeholder="Ask something that needs reasoning…"
          />
        </CardContent>
      </Card>
    </ShowcaseErrorBoundary>
  );
}
