/**
 * @fileoverview MCP showcase — assistant-ui-native.
 *
 * ## Which path did we take, and why?
 * We evaluated `@assistant-ui/react-mcp` (latest `0.0.16`). Although its
 * `peerDependencies` only pin `react`, its hard `dependencies` require
 * `@assistant-ui/core@0.2.19` + `@assistant-ui/store@0.2.19` + `@assistant-ui/tap@0.9.3`
 * (the NEW resource-based architecture shipped with core `0.14+`) and pull in
 * `@radix-ui/react-primitive`. This project is pinned to `@assistant-ui/react@0.12.28`
 * (core `0.1.x` / store `0.2.x` / tap `0.5.x`) and is a zero-Radix codebase, so
 * `react-mcp`'s primitives (`McpManagerPrimitive`, `McpServerPrimitive`, …) would
 * either fail to resolve the runtime context or force a conflicting duplicate core
 * into the bundle. This is the same peer/dep trap as `@assistant-ui/react-markdown`.
 * We therefore DID NOT install `@assistant-ui/react-mcp` and built the MCP UI
 * natively with our existing assistant-ui primitives instead.
 *
 * ## What this native surface does
 *  - (a) Lists the live MCP tool catalog via the agent's `@callable listTools()`
 *        RPC (see {@link McpToolCatalog}).
 *  - (b) Lets the user invoke any tool via `@callable callTool(name, input)` and
 *        shows the real result.
 *  - (c) Runs a chat through the Wave-1 assistant-ui `Thread` (markdown replies +
 *        tool-call rendering). The three MCP tools (`echo` / `currentTime` /
 *        `dbCount`) render as rich cards via {@link McpToolUIs} (`makeAssistantToolUI`),
 *        with a guided welcome screen and suggested prompts.
 *
 * A single `useAgent` WebSocket to the `MCP_AGENT` Durable Object backs both the
 * RPC catalog and the streaming chat. Mounted `client:only="react"`.
 */

"use client";

import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";

import { AssistantRuntimeProvider, type AssistantRuntime } from "@assistant-ui/react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Thread } from "@/components/assistant/Thread";

import { statusFromReadyState } from "./AgentThread";
import { McpToolCatalog, type CatalogAgent } from "./McpToolCatalog";
import { McpToolUIs } from "./McpToolUIs";
import { ConnectionBadge, useSessionId } from "./shared";

/** Guided starter prompts — each maps directly to one MCP tool. */
const WELCOME_SUGGESTIONS = [
  "What time is it?",
  "Echo hello",
  "How many tasks are in the DB?",
];

/** Follow-up chips shown after the latest assistant reply. */
const FOLLOWUP_SUGGESTIONS = [
  "Now count the projects",
  "What time is it in Tokyo?",
  "Echo 'MCP works'",
];

/** MCP showcase: live tool catalog + direct call form + assistant-ui chat. */
export function McpPanel() {
  const sessionId = useSessionId("mcp");

  // One WebSocket to the MCP_AGENT DO backs BOTH the RPC catalog and the chat.
  // `agent: "mcp-agent"` is the kebab-case class name; `name` keys the instance.
  const agent = useAgent({ agent: "mcp-agent", name: sessionId });
  const chat = useAgentChat({ agent });
  // `useAISDKRuntime` returns an `AssistantRuntime` typed against the AI-SDK
  // package's copy of the type, which is structurally identical but nominally
  // distinct from the core package's. Cast to the core type the provider wants
  // (same pattern as `assistant/runtime.tsx`).
  const runtime = useAISDKRuntime(chat) as unknown as AssistantRuntime;
  const status = statusFromReadyState(agent.readyState);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left column: live catalog (tools/list) + direct call form (tools/call). */}
      <div className="flex flex-col gap-6">
        <div className="flex justify-end">
          <ConnectionBadge status={status} sessionId={sessionId} />
        </div>
        <McpToolCatalog agent={agent as unknown as CatalogAgent} status={status} />
      </div>

      {/* Right column: the Wave-1 assistant-ui Thread with MCP tool cards. */}
      <Card className="flex h-[40rem] flex-col">
        <CardHeader className="pb-3">
          <CardTitle>Chat over MCP tools</CardTitle>
          <CardDescription>
            The model calls <code className="text-primary">echo</code>,{" "}
            <code className="text-primary">currentTime</code>, and{" "}
            <code className="text-primary">dbCount</code> — each rendered as a rich
            tool card with markdown replies.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <AssistantRuntimeProvider runtime={runtime}>
            {/* Register the MCP tool-call renderers (renders nothing visible). */}
            <McpToolUIs />
            <Thread
              placeholder="e.g. what time is it? how many tasks in the DB?"
              welcomeTitle="MCP tools, live"
              welcomeSubtitle="Ask the agent to run one of its three tools. Results render as rich cards."
              welcomeSuggestions={WELCOME_SUGGESTIONS}
              followUpSuggestions={FOLLOWUP_SUGGESTIONS}
              status={status}
            />
          </AssistantRuntimeProvider>
        </CardContent>
      </Card>
    </div>
  );
}
