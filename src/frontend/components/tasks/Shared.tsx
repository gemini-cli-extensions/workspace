/**
 * @fileoverview Small presentational primitives shared across the Projects &
 * Tasks islands: empty states, inline error banners, label chip rows, and the
 * assignee avatar. Centralizing these keeps every island under the 400-line cap
 * and guarantees the EMPTY / ERROR affordances look identical everywhere.
 */

import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { initials } from "./types";

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Centered placeholder shown when a query returns zero rows. */
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

// ---------------------------------------------------------------------------
// ErrorState
// ---------------------------------------------------------------------------

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Inline, non-blocking error banner. Surfaces `ApiError.message` and offers an
 * optional retry. Never throws an alert(); always rendered in-flow.
 */
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

// ---------------------------------------------------------------------------
// LabelChips
// ---------------------------------------------------------------------------

/** Render a task's JSON `labels[]` as a row of subtle chips. */
export function LabelChips({
  labels,
  className,
  max,
}: {
  labels: string[];
  className?: string;
  max?: number;
}) {
  if (!labels || labels.length === 0) return null;
  const shown = max ? labels.slice(0, max) : labels;
  const overflow = max ? labels.length - shown.length : 0;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((label) => (
        <Badge key={label} variant="secondary" className="font-normal">
          {label}
        </Badge>
      ))}
      {overflow > 0 ? (
        <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">
          +{overflow}
        </Badge>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssigneeAvatar
// ---------------------------------------------------------------------------

/** Initials avatar + optional name label for a task assignee. */
export function AssigneeAvatar({
  name,
  showName = false,
  size = "sm",
  className,
}: {
  name: string | null | undefined;
  showName?: boolean;
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Avatar size={size}>
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      {showName ? (
        <span className="truncate text-sm text-muted-foreground">{name ?? "Unassigned"}</span>
      ) : null}
    </div>
  );
}
