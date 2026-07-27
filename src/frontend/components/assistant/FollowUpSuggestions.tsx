/**
 * @fileoverview Dynamic follow-up suggestion chips.
 *
 * After each COMPLETED assistant reply, this component asks
 * `POST /api/threads/followups` for three short next-prompts derived from the
 * recent conversation, then renders them as chips. Tapping a chip writes it into
 * the composer and sends it.
 *
 * Built on `useAui()` (the assistant-ui client) so it can:
 *  - read the thread's messages + `isRunning` flag (`aui.thread().getState()`),
 *  - resolve the active thread's remote id (`aui.threadListItem()`),
 *  - send a chip (`aui.composer().setText(...) + send()`).
 *
 * It re-fetches only when a NEW assistant turn completes (keyed by message
 * count + running state), and clears while a run is in flight. Best-effort: any
 * failure simply renders nothing. Must be rendered inside the runtime provider.
 */

"use client";

import * as React from "react";

import { useAui } from "@assistant-ui/react";

/** A loose view of a runtime message (role + text-bearing content parts). */
interface RuntimeMessageLike {
  role: "user" | "assistant" | "system";
  content?: ReadonlyArray<{ type?: string; text?: string }>;
}

/** Extract concatenated text from a runtime message's content parts. */
function messageText(message: RuntimeMessageLike): string {
  return (message.content ?? [])
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join(" ")
    .trim();
}

/** Props for {@link FollowUpSuggestions}. */
export interface FollowUpSuggestionsProps {
  /** Fallback chips shown before the model returns dynamic ones (optional). */
  fallback?: readonly string[];
  className?: string;
}

/**
 * Render dynamic follow-up chips beneath the latest assistant reply.
 */
export function FollowUpSuggestions({ fallback = [], className }: FollowUpSuggestionsProps) {
  const aui = useAui();
  const [suggestions, setSuggestions] = React.useState<readonly string[]>([]);

  // Read a lightweight snapshot of the thread on every render (cheap; the
  // parent re-renders on runtime changes). We key the effect on the derived
  // signature so the fetch only fires when a new assistant turn completes.
  let messages: RuntimeMessageLike[] = [];
  let isRunning = false;
  let remoteId: string | undefined;
  try {
    const thread = aui.thread().getState() as unknown as {
      messages: RuntimeMessageLike[];
      isRunning: boolean;
    };
    messages = thread.messages ?? [];
    isRunning = thread.isRunning ?? false;
  } catch {
    // Thread scope not ready yet — render nothing.
  }
  try {
    remoteId = (aui.threadListItem().getState() as unknown as { remoteId?: string }).remoteId;
  } catch {
    remoteId = undefined;
  }

  const last = messages[messages.length - 1];
  const lastIsAssistant = last?.role === "assistant" && messageText(last).length > 0;
  // Signature changes exactly once per completed assistant turn.
  const signature = isRunning ? "running" : `${messages.length}:${lastIsAssistant ? "a" : "x"}`;

  React.useEffect(() => {
    let cancelled = false;

    if (isRunning) {
      setSuggestions([]);
      return;
    }
    if (!lastIsAssistant) {
      setSuggestions([]);
      return;
    }

    const payload = {
      threadId: remoteId,
      messages: messages
        .map((m) => ({ role: m.role, content: messageText(m) }))
        .filter((m) => m.content.length > 0)
        .slice(-6),
    };
    if (payload.messages.length === 0) {
      setSuggestions([]);
      return;
    }

    void fetch("/api/threads/followups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => (res.ok ? res.json() : { suggestions: [] }))
      .then((data) => {
        const parsed = data as { suggestions?: string[] };
        if (!cancelled) setSuggestions(parsed.suggestions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const chips = suggestions.length > 0 ? suggestions : isRunning ? [] : fallback;
  if (chips.length === 0) return null;

  /** Write the prompt into the composer and send it. */
  const send = (prompt: string) => {
    try {
      aui.composer().setText(prompt);
      aui.composer().send();
    } catch {
      // Composer not ready — ignore.
    }
  };

  return (
    <div className={className ?? "mt-1 flex flex-wrap gap-2 px-1"}>
      {chips.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => send(prompt)}
          className="rounded-full bg-muted/40 px-3 py-1.5 text-xs text-foreground/80 ring-1 ring-border/40 transition-colors hover:bg-muted/70 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
