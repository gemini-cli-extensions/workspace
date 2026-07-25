/**
 * @fileoverview Delegation tool UI for the Multi-Agent showcase.
 *
 * Implements the assistant-ui **Multi-Agent pattern**: when the
 * {@link OrchestratorAgent} invokes the `spawnTask` delegation tool, its result
 * carries a `messages` array (assistant-ui-compatible `ThreadMessage` objects
 * representing the sub-agent's user/assistant turns). This renderer registers a
 * tool UI for `spawnTask` (via `makeAssistantToolUI`) that shows a live
 * "<Specialist> Agent (working…)" header while the delegation runs, then renders
 * the sub-agent conversation **nested** underneath the tool call.
 *
 * ## Which primitive renders the nested thread
 * assistant-ui 0.12.28 exposes `MessagePartPrimitive.Messages`
 * (`PartPrimitiveMessages`) which reads a `messages` array off the current tool
 * part in the store. However, the `@assistant-ui/react-ai-sdk@1.3.x` runtime
 * adapter does NOT forward a tool result's `messages` field into that part
 * scope, so the primitive would render nothing here. Per the task's documented
 * fallback, we instead render the `result.messages` array directly with a small
 * readonly nested message list ({@link NestedMessages}) reusing {@link MarkdownText}
 * for assistant turns. The sub-agent conversation therefore always renders
 * nested under the tool call regardless of adapter version.
 *
 * Mounting {@link SubAgentToolUI} anywhere inside the `AssistantRuntimeProvider`
 * registers the renderer (it renders nothing until a `spawnTask` call appears).
 */

"use client";

import type { FC } from "react";

import { BotIcon, Loader2Icon, UserIcon } from "lucide-react";

import { makeAssistantToolUI } from "@assistant-ui/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { MarkdownText } from "@/components/assistant/MarkdownText";

/** A single text part of a nested sub-agent message. */
interface NestedTextPart {
  type: "text";
  text: string;
}

/** A nested sub-agent conversation turn (subset of assistant-ui `ThreadMessage`). */
interface NestedMessage {
  id: string;
  role: "user" | "assistant";
  content: NestedTextPart[];
}

/** Input args of the orchestrator's `spawnTask` delegation tool. */
interface SpawnTaskArgs {
  agentType?: "research" | "code";
  task?: string;
}

/** Result the orchestrator returns from `spawnTask` (see OrchestratorAgent types). */
interface SpawnTaskResult {
  agentType?: "research" | "code";
  instance?: string;
  status?: "completed" | "failed";
  output?: string;
  answer?: string;
  error?: string;
  durationMs?: number;
  messages?: NestedMessage[];
}

/** Human label for a specialist agent type. */
function specialistLabel(agentType?: string): string {
  if (agentType === "research") return "Researcher Agent";
  if (agentType === "code") return "Coder Agent";
  return "Sub-agent";
}

/** Concatenate a message's text parts into a single string. */
function messageText(message: NestedMessage): string {
  return message.content
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/**
 * Readonly nested message list — renders the sub-agent conversation carried in
 * the delegation tool result. User turns render as compact bubbles; assistant
 * turns render markdown via the shared {@link MarkdownText}.
 */
const NestedMessages: FC<{ messages: NestedMessage[] }> = ({ messages }) => (
  <div className="mt-3 space-y-2 border-l-2 border-primary/30 pl-3">
    {messages.map((message) => {
      const isUser = message.role === "user";
      return (
        <div
          key={message.id}
          className={cn("flex gap-2", isUser ? "justify-start" : "justify-start")}
        >
          <div
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1",
              isUser
                ? "bg-muted/60 text-muted-foreground ring-border/40"
                : "bg-primary/10 text-primary ring-primary/30",
            )}
            aria-hidden
          >
            {isUser ? <UserIcon className="size-3" /> : <BotIcon className="size-3" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              {isUser ? "Task" : "Response"}
            </p>
            {isUser ? (
              <p className="text-sm break-words whitespace-pre-wrap text-foreground/90">
                {messageText(message)}
              </p>
            ) : (
              <div className="text-sm">
                <MarkdownText text={messageText(message)} />
              </div>
            )}
          </div>
        </div>
      );
    })}
  </div>
);

/**
 * Tool-UI renderer for the orchestrator's `spawnTask` delegation tool. Shows a
 * working header while the sub-agent runs, then the nested sub-agent thread.
 */
export const SubAgentToolUI = makeAssistantToolUI<SpawnTaskArgs, SpawnTaskResult>({
  toolName: "spawnTask",
  render: ({ args, result, status }) => {
    const agentType = result?.agentType ?? args?.agentType;
    const label = specialistLabel(agentType);
    const isRunning =
      status?.type === "running" || (!result && status?.type !== "incomplete");
    const messages = result?.messages ?? [];

    return (
      <div className="my-2 w-full rounded-xl bg-card p-3 ring-1 ring-border/40">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Loader2Icon className="size-4 animate-spin text-primary" />
            ) : (
              <BotIcon className="size-4 text-primary" />
            )}
            <span className="text-sm font-medium text-foreground">{label}</span>
            {isRunning ? (
              <span className="text-xs text-muted-foreground">(working…)</span>
            ) : null}
          </div>
          {result?.status ? (
            <div className="flex items-center gap-2 text-[10px] tracking-wide uppercase">
              <Badge variant={result.status === "failed" ? "destructive" : "default"}>
                {result.status}
              </Badge>
              {typeof result.durationMs === "number" ? (
                <span className="text-muted-foreground">{result.durationMs}ms</span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Show the delegated task immediately (from args) while running. */}
        {isRunning && args?.task ? (
          <p className="mt-2 border-l-2 border-primary/30 pl-3 text-sm text-muted-foreground">
            {args.task}
          </p>
        ) : null}

        {/* Nested sub-agent conversation, rendered once the result arrives. */}
        {messages.length > 0 ? <NestedMessages messages={messages} /> : null}

        {/* Error fallback when no nested messages were produced. */}
        {!isRunning && messages.length === 0 && result?.error ? (
          <p className="mt-2 text-sm text-destructive">{result.error}</p>
        ) : null}
      </div>
    );
  },
});
