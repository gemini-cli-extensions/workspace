/**
 * @fileoverview Tiny presentational primitives reused across the dashboard.
 *
 * Keeps the Monolith look consistent (ring-based separation, no 1px borders,
 * muted-foreground secondary text) and centralises the inline EMPTY / ERROR
 * affordances so every panel handles failure the same way — surfaced in-place,
 * never through `window.alert`.
 */

"use client";

import { AlertTriangle, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Inline error block. Renders the `ApiError` message verbatim and offers a
 * retry button wired to the resource's `reload`.
 */
export function InlineError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-md bg-destructive/10 px-4 py-8 text-center ring-1 ring-destructive/30",
        className,
      )}
    >
      <AlertTriangle className="size-5 text-destructive" aria-hidden />
      <p className="text-sm text-destructive">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/** Neutral empty state for a panel that loaded successfully but has no rows. */
export function EmptyState({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-md bg-muted/20 px-4 py-10 text-center ring-1 ring-border/40",
        className,
      )}
    >
      <Inbox className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Uppercase section eyebrow used above panels. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}
