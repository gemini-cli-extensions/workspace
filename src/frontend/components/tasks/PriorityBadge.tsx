/**
 * @fileoverview PriorityBadge — a high-contrast, dark-theme pill conveying a
 * task's urgency. Used on board cards, task rows, and the detail view so the
 * priority color language stays consistent across every Tasks surface.
 *
 * Monolith color language (per spec):
 *   low    → muted  (neutral, de-emphasized)
 *   medium → blue   (chart-1 token family)
 *   high   → amber  (chart-4 token family)
 *   urgent → rose   (destructive / rose token family)
 *
 * Colors are expressed with explicit bg/text utility pairs tuned for the
 * dark surface rather than the generic Badge variants, so each level reads at a
 * glance without relying on the (banned) 1px border separators.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { PRIORITY_LABELS, type TaskPriority } from "./types";

/** Tailwind class pairs per priority — dark-surface tuned, high contrast. */
const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-sky-500/15 text-sky-300",
  high: "bg-amber-500/15 text-amber-300",
  urgent: "bg-rose-500/15 text-rose-300",
};

export interface PriorityBadgeProps {
  priority: TaskPriority;
  className?: string;
}

/** Render a priority as a colored pill. */
export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", PRIORITY_CLASSES[priority], className)}
    >
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}
