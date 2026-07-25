/**
 * @fileoverview facet-options — builders that turn the Tasks domain vocabulary
 * (statuses, priorities, assignees, labels, projects) into {@link FacetOption}
 * arrays for the {@link FacetFilter}. Each builder attaches:
 *
 *   - a `render` so the facet shows the right inline leading visual:
 *       Status   → a colored status dot + label
 *       Priority → a colored priority dot + label
 *       Label    → a colored label dot + chip
 *       Assignee → an initials avatar + name
 *       Project  → a name (truncated in the trigger)
 *   - a per-option `count` (drawn from {@link TaskFacetCounts}) so each row can
 *     show how many of the loaded tasks match that value — the Linear-style "N".
 *
 * Keeping these out of `TaskFilters.tsx` keeps every island under the 400-line
 * cap and lets the detail / board surfaces reuse the same option vocabulary.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { AssigneeAvatar } from "./Shared";
import type { FacetOption } from "./FacetFilter";
import type { FacetCounts } from "./useTaskFacets";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "./types";

/** Status → dot color, matching the StatusBadge color vocabulary. */
const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/60",
  in_progress: "bg-sky-400",
  in_review: "bg-violet-400",
  done: "bg-emerald-400",
};

/** Priority → dot color, matching the PriorityBadge color vocabulary. */
const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: "bg-muted-foreground/60",
  medium: "bg-sky-400",
  high: "bg-amber-400",
  urgent: "bg-rose-400",
};

/** A small colored dot used as a facet's inline leading visual. */
function Dot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("size-2 shrink-0 rounded-full", className)} />
  );
}

/**
 * Deterministically map a free-text value (label name) to one of a handful of
 * dot hues, so a given label always renders the same color.
 */
const LABEL_DOT_HUES = [
  "bg-sky-400",
  "bg-emerald-400",
  "bg-amber-400",
  "bg-violet-400",
  "bg-rose-400",
  "bg-teal-400",
];
function labelHue(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return LABEL_DOT_HUES[Math.abs(hash) % LABEL_DOT_HUES.length]!;
}

/** Build the Status facet options (leading = colored dot + label + count). */
export function statusFacetOptions(counts: FacetCounts = {}): FacetOption[] {
  return (Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => ({
    value: status,
    label: STATUS_LABELS[status],
    count: counts[status],
    render: ({ context }) =>
      context === "trigger" ? (
        <span className="flex items-center gap-1">
          <Dot className={STATUS_DOT[status]} />
          {STATUS_LABELS[status]}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Dot className={STATUS_DOT[status]} />
          <span className="truncate">{STATUS_LABELS[status]}</span>
        </span>
      ),
  }));
}

/** Build the Priority facet options (leading = colored dot + label + count). */
export function priorityFacetOptions(counts: FacetCounts = {}): FacetOption[] {
  return (Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => ({
    value: priority,
    label: PRIORITY_LABELS[priority],
    count: counts[priority],
    render: ({ context }) =>
      context === "trigger" ? (
        <span className="flex items-center gap-1">
          <Dot className={PRIORITY_DOT[priority]} />
          {PRIORITY_LABELS[priority]}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Dot className={PRIORITY_DOT[priority]} />
          <span className="truncate">{PRIORITY_LABELS[priority]}</span>
        </span>
      ),
  }));
}

/** Build the Project facet options from id/name pairs + counts. */
export function projectFacetOptions(
  options: { value: string; label: string }[],
  counts: FacetCounts = {},
): FacetOption[] {
  return options.map((o) => ({
    value: o.value,
    label: o.label,
    count: counts[o.value],
    render: ({ context }) =>
      context === "trigger" ? (
        <span className="max-w-[8rem] truncate">{o.label}</span>
      ) : (
        <span className="truncate">{o.label}</span>
      ),
  }));
}

/** Build the Assignee facet options from distinct display names + counts. */
export function assigneeFacetOptions(
  names: string[],
  counts: FacetCounts = {},
): FacetOption[] {
  return names.map((name) => ({
    value: name,
    label: name,
    keywords: name,
    count: counts[name],
    render: ({ context }) =>
      context === "trigger" ? (
        <span className="max-w-[7rem] truncate">{name}</span>
      ) : (
        <AssigneeAvatar name={name} showName size="sm" />
      ),
  }));
}

/** Build the Label facet options from distinct label strings + counts. */
export function labelFacetOptions(
  labels: string[],
  counts: FacetCounts = {},
): FacetOption[] {
  return labels.map((label) => ({
    value: label,
    label,
    keywords: label,
    count: counts[label],
    render: ({ context }) =>
      context === "trigger" ? (
        <span className="flex max-w-[7rem] items-center gap-1">
          <Dot className={labelHue(label)} />
          <span className="truncate">{label}</span>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Dot className={labelHue(label)} />
          <Badge variant="secondary" className="font-normal">
            {label}
          </Badge>
        </span>
      ),
  }));
}
