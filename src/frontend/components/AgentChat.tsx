/**
 * @fileoverview AgentChat — the enhanced assistant-ui `<Thread />` wired to the
 * ChatBroker Durable Object over a WebSocket channel.
 *
 * `useAgentChat` from `@cloudflare/ai-chat/react` opens a WebSocket directly to
 * the `CHAT_BROKER` Durable Object (keyed by session id) and streams UI-message
 * frames back. The DO calls Workers AI via the project's `getChatModel()` on the
 * server side. No external provider middleware sits in between.
 *
 * The visible surface is the shared, enhanced {@link Thread} (markdown replies
 * via Shiki code blocks, welcome + follow-up suggestion chips, and inline
 * generative-UI tool cards for `showMetric` / `createTaskDraft`).
 *
 * Browser-only: depends transitively on `agents/react` + PartySocket. The
 * consuming page mounts this `client:only="react"`.
 */

"use client";

import { useState } from "react";

import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ThreadProvider, type ThreadStatus } from "@/components/assistant/Thread";

/** Resolve (and persist) a stable per-session ChatBroker id. */
function newSessionId() {
  if (typeof window === "undefined") return "session-ssr";
  const stored = window.sessionStorage.getItem("agent-chat-session");
  if (stored) return stored;
  const fresh = `session-${crypto.randomUUID()}`;
  window.sessionStorage.setItem("agent-chat-session", fresh);
  return fresh;
}

/** Map PartySocket `readyState` (0=CONNECTING, 1=OPEN, 2/3=CLOSING/CLOSED). */
function statusFromReadyState(readyState: number): ThreadStatus {
  if (readyState === 1) return "connected";
  if (readyState === 0) return "connecting";
  return "disconnected";
}

export function AgentChat() {
  const [sessionId] = useState(newSessionId);

  // 1. Open the long-lived WebSocket to the ChatBroker DO. The agent name
  //    (`chat-broker`) is the kebab-case class name; `name` keys the instance.
  const agent = useAgent({ agent: "chat-broker", name: sessionId });

  // 2. Subscribe to the broker's persisted message stream. History rehydrates
  //    server-side from the DO's SQLite store via the SDK's `/get-messages`.
  const chat = useAgentChat({ agent });

  // 3. Adapt the AI SDK chat surface to assistant-ui's runtime.
  const runtime = useAISDKRuntime(chat);
  const status = statusFromReadyState(agent.readyState);

  return (
    <Card className="flex h-[calc(100vh-12rem)] flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle>Assistant</CardTitle>
          <CardDescription>
            assistant-ui Thread routed through the ChatBroker Durable Object over a
            WebSocket channel. Markdown, suggestions, and generative UI included.
          </CardDescription>
        </div>
        <code className="shrink-0 text-xs text-muted-foreground">{sessionId.slice(0, 18)}…</code>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 p-0">
        <ThreadProvider runtime={runtime} status={status} />
      </CardContent>
    </Card>
  );
}
