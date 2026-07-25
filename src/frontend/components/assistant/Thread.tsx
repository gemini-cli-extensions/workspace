/**
 * @fileoverview Thread — the enhanced, Monolith-styled assistant-ui Thread.
 *
 * Built entirely from `@assistant-ui/react` primitives + the project's base-ui
 * components (zero Radix shadcn registry). Supersedes the showcase `AgentThread`
 * for the assistant surfaces by adding:
 *   - Markdown assistant text via {@link MarkdownText} (Shiki code blocks).
 *   - A welcome screen with starter suggestion chips (empty thread).
 *   - Follow-up suggestion chips after the latest assistant reply.
 *   - Inline generative-UI tool cards (`showMetric`, `createTaskDraft`).
 *   - Reasoning-part rendering (preserved from `AgentThread`).
 *   - A floating scroll-to-bottom button and an optional connection badge.
 *
 * This component expects to be rendered INSIDE an `AssistantRuntimeProvider`
 * (see `runtime.tsx` for the multi-thread provider, or pass a single runtime via
 * {@link ThreadProvider}). It is browser-only — every consumer mounts
 * `client:only="react"`.
 */

"use client";

import { type ComponentProps, type FC } from "react";

import { ArrowDownIcon, Loader2Icon } from "lucide-react";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import type {
  ReasoningMessagePartProps,
  TextMessagePartProps,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ToolCallCard } from "@/components/showcase/ToolCallCard";

import { MarkdownText } from "./MarkdownText";
import { AssistantToolUIs } from "./generative";
import { FollowUpSuggestions } from "./FollowUpSuggestions";
import { ModelPicker } from "./ModelPicker";

/** Connection status for the optional header badge. */
export type ThreadStatus = "connecting" | "connected" | "disconnected";

type RuntimeProp = ComponentProps<typeof AssistantRuntimeProvider>["runtime"];

/** Default starter prompts shown on the empty (welcome) screen. */
const DEFAULT_WELCOME_SUGGESTIONS = [
  "Show me a KPI card for request volume",
  "Draft a high-priority task to review the deploy",
  "Explain Durable Objects with a code example",
  "What can you help me build on Cloudflare?",
];

/** Fallback follow-up prompts used until the model returns dynamic ones. */
const DEFAULT_FOLLOWUP_SUGGESTIONS = [
  "Show that as a metric card",
  "Chart it for me",
  "Turn this into a task draft",
];

/** Markdown renderer for assistant text parts. */
const TextPart: FC<TextMessagePartProps> = ({ text }) => <MarkdownText text={text} />;

/** Collapsible-free reasoning block, matching the showcase styling. */
const ReasoningPart: FC<ReasoningMessagePartProps> = ({ text }) => (
  <div className="mb-2 rounded-md bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground italic ring-1 ring-border/40">
    {text}
  </div>
);

/**
 * Fallback tool renderer for any tool WITHOUT a dedicated `makeAssistantToolUI`
 * registration (the demo tools `showMetric` / `createTaskDraft` are intercepted
 * by their registered renderers before reaching this fallback).
 */
const FallbackTool: FC<ToolCallMessagePartProps> = (props) => (
  <ToolCallCard
    toolName={props.toolName}
    args={props.args}
    result={props.result}
    status={props.status?.type}
  />
);

/** A single Monolith suggestion chip wrapping a `ThreadPrimitive.Suggestion`. */
function SuggestionChip({ prompt }: { prompt: string }) {
  return (
    <ThreadPrimitive.Suggestion
      prompt={prompt}
      send
      className="rounded-full bg-muted/40 px-3 py-1.5 text-xs text-foreground/80 ring-1 ring-border/40 transition-colors hover:bg-muted/70 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {prompt}
    </ThreadPrimitive.Suggestion>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-start">
      <div className="w-full max-w-[90%] rounded-2xl rounded-bl-sm bg-muted/50 px-3.5 py-2.5 text-sm ring-1 ring-border/30">
        <MessagePrimitive.Parts
          components={{
            Text: TextPart,
            Reasoning: ReasoningPart,
            tools: { Fallback: FallbackTool },
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

/** Props for {@link Thread}. */
export interface ThreadProps {
  /** Composer placeholder. */
  placeholder?: string;
  /** Welcome-screen heading. */
  welcomeTitle?: string;
  /** Welcome-screen subtitle. */
  welcomeSubtitle?: string;
  /** Starter prompts on the empty screen. */
  welcomeSuggestions?: string[];
  /** Follow-up prompts after the latest reply. */
  followUpSuggestions?: string[];
  /** When provided, renders a connection badge in a compact header strip. */
  status?: ThreadStatus;
  /** Extra classes for the root. */
  className?: string;
}

/**
 * The enhanced Thread surface. Must be rendered inside an
 * `AssistantRuntimeProvider`.
 */
export function Thread({
  placeholder = "Ask the assistant…",
  welcomeTitle = "How can I help?",
  welcomeSubtitle = "Ask a question, request a metric card, or draft a task.",
  welcomeSuggestions = DEFAULT_WELCOME_SUGGESTIONS,
  followUpSuggestions = DEFAULT_FOLLOWUP_SUGGESTIONS,
  status,
  className,
}: ThreadProps) {
  return (
    <ThreadPrimitive.Root className={cn("flex h-full min-h-0 flex-col", className)}>
      {/* Register generative-UI tool renderers (renders nothing visible). */}
      <AssistantToolUIs />

      {/* Header: per-thread Workers AI model picker + optional connection status. */}
      <div className="flex items-center justify-between gap-2 border-b border-border/30 px-4 py-2">
        <ModelPicker />
        {status ? (
          <Badge variant={status === "connected" ? "default" : "outline"}>{status}</Badge>
        ) : (
          <span />
        )}
      </div>

      <ThreadPrimitive.Viewport className="relative flex-1 overflow-y-auto px-4 py-4">
        <ThreadPrimitive.Empty>
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 py-10 text-center">
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {welcomeTitle}
              </h2>
              <p className="text-sm text-muted-foreground">{welcomeSubtitle}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {welcomeSuggestions.map((prompt) => (
                <SuggestionChip key={prompt} prompt={prompt} />
              ))}
            </div>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />

        {/* Dynamic follow-up suggestions: fetched from the model after each
            completed assistant reply, with a static fallback. Visible only when
            the thread has messages and is not mid-run. */}
        <ThreadPrimitive.If empty={false} running={false}>
          <FollowUpSuggestions fallback={followUpSuggestions} />
        </ThreadPrimitive.If>
      </ThreadPrimitive.Viewport>

      {/* Floating scroll-to-bottom — only shown when scrolled up. */}
      <div className="pointer-events-none relative">
        <ThreadPrimitive.ScrollToBottom asChild>
          <Button
            size="icon"
            variant="secondary"
            className="pointer-events-auto absolute -top-12 left-1/2 size-9 -translate-x-1/2 rounded-full shadow-lg ring-1 ring-border/40 disabled:hidden"
            aria-label="Scroll to bottom"
          >
            <ArrowDownIcon className="size-4" />
          </Button>
        </ThreadPrimitive.ScrollToBottom>
      </div>

      <ComposerPrimitive.Root className="flex items-end gap-2 px-4 py-3">
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder={placeholder}
          className="flex-1 resize-none rounded-xl bg-muted/40 px-3.5 py-2.5 text-sm ring-1 ring-foreground/10 placeholder:text-muted-foreground focus:outline-none focus:ring-foreground/30"
        />
        <ThreadPrimitive.If running>
          <ComposerPrimitive.Cancel asChild>
            <Button size="icon" variant="secondary" aria-label="Stop">
              <Loader2Icon className="size-4 animate-spin" />
            </Button>
          </ComposerPrimitive.Cancel>
        </ThreadPrimitive.If>
        <ThreadPrimitive.If running={false}>
          <ComposerPrimitive.Send asChild>
            <Button size="sm">Send</Button>
          </ComposerPrimitive.Send>
        </ThreadPrimitive.If>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

/**
 * Convenience wrapper: render {@link Thread} inside its own provider for the
 * single-runtime case (e.g. the homepage modal). Multi-thread surfaces use the
 * provider from `runtime.tsx` and render `<Thread />` directly.
 */
export function ThreadProvider({
  runtime,
  ...props
}: ThreadProps & { runtime: unknown }) {
  return (
    <AssistantRuntimeProvider runtime={runtime as unknown as RuntimeProp}>
      <Thread {...props} />
    </AssistantRuntimeProvider>
  );
}
