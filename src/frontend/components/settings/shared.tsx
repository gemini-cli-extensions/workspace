/**
 * @fileoverview Shared presentational primitives for the settings islands.
 *
 * These are intentionally small, local-to-settings building blocks (not part of
 * the global `ui/` design system) that encode the Monolith "settings row"
 * pattern: a label + description on the left, a control on the right, sections
 * divided by `divide-border/40` with no traditional 1px borders.
 *
 * Exports:
 *   - SettingsRow       – one label/description + control row
 *   - SettingsRowGroup  – a vertically divided group of rows
 *   - SectionHeader     – a section title + optional description
 *   - SavedFlash        – a transient "Saved" inline confirmation
 *   - InlineError       – a destructive inline error line (ApiError.message)
 *   - RowSkeleton       – a loading placeholder for a settings row
 */

"use client";

import { CheckCircle2Icon } from "lucide-react";
import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A single settings control row: text on the left, control on the right. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  control,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** When the control is a labelable element, wire the label to it. */
  htmlFor?: string;
  control: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium text-foreground">{label}</p>
        )}
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center sm:justify-end">{control}</div>
    </div>
  );
}

/** A vertically divided group of settings rows (no outer border). */
export function SettingsRowGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-border/40", className)}>{children}</div>
  );
}

/** A titled section header with an optional supporting description. */
export function SectionHeader({
  title,
  description,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

/**
 * A transient inline "Saved" confirmation. Render conditionally on `show`; the
 * caller is responsible for flipping it back off (typically on a timer).
 */
export function SavedFlash({ show, label = "Saved" }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
      <CheckCircle2Icon className="size-3.5" />
      {label}
    </span>
  );
}

/** A destructive inline error line, typically fed `ApiError.message`. */
export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

/** A loading placeholder shaped like a settings row. */
export function RowSkeleton() {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <Skeleton className="h-6 w-16" />
    </div>
  );
}

/**
 * Small hook that returns a `[show, flash]` pair. Calling `flash()` sets `show`
 * true for `ms` milliseconds then clears it — used for the "Saved" confirmation.
 */
export function useSavedFlash(ms = 2500): [boolean, () => void] {
  const [show, setShow] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setShow(true);
    timer.current = setTimeout(() => setShow(false), ms);
  }, [ms]);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return [show, flash];
}
