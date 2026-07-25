/**
 * @fileoverview Shared assistant-ui Thread surface for the agent showcase
 * islands. Extracted from `AgentChat.tsx` so every chat-style showcase panel
 * (code-mode, workflows, browser-hitl, multi-agent, mcp, thinking, skills)
 * can mount the same Monolith-styled `<Thread />` without duplicating the
 * `AssistantRuntimeProvider` + primitive wiring.
 *
 * This file is intentionally framework-only: it never opens its own
 * connection. The caller owns `useAgent` / `useAgentChat` (so it can also
 * subscribe to state / call RPC methods) and passes the resulting `runtime`
 * down. That keeps the WebSocket lifecycle in one place per panel.
 *
 * IMPORTANT: every consumer of this component is browser-only (it transitively
 * depends on `agents/react` + PartySocket). Mount the consuming island with
 * `client:only="react"` — NEVER `client:load` — or SSR will crash inside the
 * agents stack with "Cannot read properties of null (reading 'useMemo')".
 */

"use client";

import { type ComponentProps, type FC } from "react";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import type {
  ReasoningMessagePartProps,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";

import { Button } from "@/components/ui/button";

import { ToolCallCard } from "./ToolCallCard";

/** Connection status derived from a PartySocket `readyState`. */
export type AgentStatus = "connecting" | "connected" | "disconnected";

/**
 * Map a PartySocket `readyState` (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)
 * to a human-facing status string used by the connection badge.
 */
export function statusFromReadyState(readyState: number): AgentStatus {
  if (readyState === 1) return "connected";
  if (readyState === 0) return "connecting";
  return "disconnected";
}

type RuntimeProp = ComponentProps<typeof AssistantRuntimeProvider>["runtime"];

/**
 * Default reasoning renderer: a muted, italic block so any `reasoning` parts
 * a generic agent emits are still legible. The dedicated Thinking panel
 * overrides this with a collapsible trace.
 */
const DefaultReasoning: FC<ReasoningMessagePartProps> = ({ text }) => (
  <div className="mb-2 rounded-md bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground italic ring-1 ring-border/40">
    {text}
  </div>
);

/** Default tool renderer used by every panel unless a panel overrides it. */
const DefaultTool: FC<ToolCallMessagePartProps> = (props) => (
  <ToolCallCard
    toolName={props.toolName}
    args={props.args}
    result={props.result}
    status={props.status?.type}
  />
);

/** Props for {@link AgentThread}. */
export interface AgentThreadProps {
  /** The assistant-ui runtime produced by `useAISDKRuntime(chat)`. */
  runtime: unknown;
  /** Placeholder text for the composer input. */
  placeholder?: string;
  /** Copy shown when the thread has no messages. */
  emptyLabel?: string;
  /**
   * Per-tool renderers keyed by tool name. Falls back to {@link DefaultTool}
   * for unregistered tools.
   */
  toolsByName?: Record<string, FC<ToolCallMessagePartProps>>;
  /** Override the reasoning-part renderer (used by the Thinking panel). */
  reasoning?: FC<ReasoningMessagePartProps>;
}

/**
 * Monolith-styled assistant-ui Thread. Renders user + assistant messages,
 * reasoning parts, and tool calls, wrapped in an `AssistantRuntimeProvider`.
 */
export function AgentThread({
  runtime,
  placeholder = "Send a message…",
  emptyLabel = "No messages yet — start the conversation.",
  toolsByName,
  reasoning = DefaultReasoning,
}: AgentThreadProps) {
  return (
    <AssistantRuntimeProvider runtime={runtime as unknown as RuntimeProp}>
      <ThreadPrimitive.Root className="flex h-full flex-col">
        <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-4">
          <ThreadPrimitive.Empty>
            <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
              <p className="text-sm">{emptyLabel}</p>
            </div>
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage: makeAssistantMessage(toolsByName, reasoning),
            }}
          />
        </ThreadPrimitive.Viewport>

        <ComposerPrimitive.Root className="flex items-end gap-2 px-4 py-3">
          <ComposerPrimitive.Input
            rows={1}
            placeholder={placeholder}
            className="flex-1 resize-none rounded-md bg-muted/40 px-3 py-2 text-sm ring-1 ring-foreground/10 placeholder:text-muted-foreground focus:outline-none focus:ring-foreground/30"
          />
          <ComposerPrimitive.Send asChild>
            <Button size="sm">Send</Button>
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-end">
      <div className="max-w-[80%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * Build an AssistantMessage component bound to the panel's tool + reasoning
 * renderers. Returned as a stable component per render of {@link AgentThread}.
 */
function makeAssistantMessage(
  toolsByName: Record<string, FC<ToolCallMessagePartProps>> | undefined,
  reasoning: FC<ReasoningMessagePartProps>,
): FC {
  return function AssistantMessage() {
    return (
      <MessagePrimitive.Root className="mb-4 flex justify-start">
        <div className="w-full max-w-[85%] rounded-md bg-muted/60 px-3 py-2 text-sm">
          <MessagePrimitive.Parts
            components={{
              Reasoning: reasoning,
              tools: { by_name: toolsByName, Fallback: DefaultTool },
            }}
          />
        </div>
      </MessagePrimitive.Root>
    );
  };
}
