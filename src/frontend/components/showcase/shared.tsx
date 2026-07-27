/**
 * @fileoverview Small shared building blocks for the agent showcase panels:
 * a per-panel session-id generator, a connection-status badge, and a few
 * layout primitives. Keeping these here avoids duplicating the boilerplate
 * across the seven interactive islands while keeping each panel < 400 lines.
 */

"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { AgentStatus } from "./AgentThread";

/**
 * Generate (and persist for the tab) a stable session id for a given showcase
 * key. Each panel gets its own Durable Object instance keyed by this id, so a
 * refresh rehydrates the same conversation/state.
 */
export function useSessionId(key: string): string {
  return useState(() => {
    if (typeof window === "undefined") return `${key}-ssr`;
    const storageKey = `showcase:${key}`;
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) return stored;
    const fresh = `${key}-${crypto.randomUUID()}`;
    window.sessionStorage.setItem(storageKey, fresh);
    return fresh;
  })[0];
}

/** Connection status badge with a session-id hint, matching AgentChat. */
export function ConnectionBadge({
  status,
  sessionId,
}: {
  status: AgentStatus;
  sessionId: string;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <Badge variant={status === "connected" ? "default" : "outline"}>
        <span
          className={cn(
            "mr-1 inline-block size-1.5 rounded-full",
            status === "connected" && "bg-emerald-400",
            status === "connecting" && "bg-amber-400",
            status === "disconnected" && "bg-destructive",
          )}
        />
        {status}
      </Badge>
      <code className="text-[10px] text-muted-foreground">{sessionId.slice(0, 20)}…</code>
    </div>
  );
}

/** Inline error banner routed through the panel's catch handlers. */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive ring-1 ring-destructive/30">
      {message}
    </div>
  );
}

/** Centered loading shimmer used by RPC-backed panels. */
export function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="size-2 animate-pulse rounded-full bg-primary" />
      {label}
    </div>
  );
}

/** Empty-state placeholder for catalog/list panels. */
export function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground ring-1 ring-border/40">
      {label}
    </div>
  );
}
