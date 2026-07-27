/**
 * @fileoverview Workers AI model picker for the active chat thread.
 *
 * A compact base-ui `<Select>` listing the chat-capable Workers AI models from
 * the shared registry (`CHAT_MODEL_OPTIONS`). Selecting a model PATCHes the
 * active thread's `model` via `/api/threads/:id`. The `ChatBroker` DO reads that
 * value from D1 (keyed by the thread id) on the NEXT turn, so the new model
 * takes effect immediately for subsequent messages.
 *
 * Resolves the active thread's remote id + current model from the runtime via
 * `useAui()`. When no thread is selected yet (e.g. a brand-new in-memory thread
 * before its first message), the picker still works locally and persists once a
 * remote id exists. Must be rendered inside the runtime provider.
 */

"use client";

import * as React from "react";

import { useAui } from "@assistant-ui/react";

import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL_ID } from "@/backend/ai/models/chat-models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Props for {@link ModelPicker}. */
export interface ModelPickerProps {
  className?: string;
}

/**
 * Per-thread Workers AI model selector.
 */
export function ModelPicker({ className }: ModelPickerProps) {
  const aui = useAui();

  // Resolve the active thread's remote id (the D1 + DO key).
  let remoteId: string | undefined;
  try {
    remoteId = (aui.threadListItem().getState() as unknown as { remoteId?: string }).remoteId;
  } catch {
    remoteId = undefined;
  }

  const [model, setModel] = React.useState<string>(DEFAULT_CHAT_MODEL_ID);
  const [loadedFor, setLoadedFor] = React.useState<string | undefined>(undefined);

  // When the active thread changes, load its persisted model so the picker
  // reflects the stored choice (defaulting otherwise).
  React.useEffect(() => {
    if (!remoteId || remoteId === loadedFor) return;
    let cancelled = false;
    void fetch(`/api/threads/${remoteId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((row) => {
        if (cancelled) return;
        const parsed = row as { model?: string | null } | null;
        setModel(parsed?.model ?? DEFAULT_CHAT_MODEL_ID);
        setLoadedFor(remoteId);
      })
      .catch(() => {
        if (!cancelled) setLoadedFor(remoteId);
      });
    return () => {
      cancelled = true;
    };
  }, [remoteId, loadedFor]);

  /** Persist the new model to the active thread row. */
  const onChange = React.useCallback(
    (next: string) => {
      setModel(next);
      if (!remoteId) return; // no row yet; will be set once the thread persists
      void fetch(`/api/threads/${remoteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: next }),
      }).catch(() => {
        /* best-effort */
      });
    },
    [remoteId],
  );

  // Only render when there's a persistent thread context (the multi-thread
  // `/assistant` workspace). Single-thread showcase Threads (code-mode, mcp,
  // thinking, …) have no thread-list runtime, so `remoteId` is undefined there
  // and the per-thread model picker is hidden — it only applies to persisted
  // threads whose model choice is stored in `chat_threads`.
  if (!remoteId) return null;

  return (
    <Select value={model} onValueChange={(v) => onChange(String(v))}>
      <SelectTrigger size="sm" className={className ?? "h-8 min-w-44 text-xs"}>
        <SelectValue placeholder="Model" />
      </SelectTrigger>
      <SelectContent>
        {CHAT_MODEL_OPTIONS.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <span className="flex flex-col">
              <span className="text-xs font-medium">{m.label}</span>
              <span className="text-[10px] text-muted-foreground">{m.hint}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
