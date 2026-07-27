/**
 * @fileoverview Presentational EMPTY / ERROR states for the Inbox island.
 *
 * Self-contained copies (matching the Projects/Tasks look) so the inbox feature
 * folder has no cross-feature imports. Errors render inline — never as alert().
 */

import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Centered placeholder shown when a view returns zero rows. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl bg-muted/20 px-6 py-16 text-center ring-1 ring-border/40",
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground [&>svg]:size-8">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

/** Inline, non-blocking error banner with an optional retry. */
export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-destructive/20",
        className,
      )}
    >
      <AlertTriangleIcon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
