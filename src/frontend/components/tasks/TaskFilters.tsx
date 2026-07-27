/**
 * @fileoverview TaskFilters — the devl.dev/Linear-style faceted filter bar for
 * the TaskList table. A controlled component: it owns no query state; the parent
 * passes the current `value`, an `onChange` patch handler, and an `onClear`
 * reset. It also receives the derived facet vocabulary + per-option counts (via
 * {@link useTaskFacets}) and the filtered/total task tallies for the summary.
 *
 * Layout:
 *   - a free-text search {@link InputGroup};
 *   - a row of facet buttons (Status, Priority, Project, Assignee, Label), each
 *     an {@link FacetFilter} popover with an in-popover search, a multi-select
 *     {@link CheckboxGroup} of rows (leading dot/avatar + label + per-option
 *     count), and a Clear + "N selected" footer;
 *   - an "Add filter" dashed popover to reveal any facet not yet visible (all
 *     are visible by default; the control keeps parity with the reference and
 *     offers a keyboard-friendly menu to jump to a facet);
 *   - a reset-all button and an "{N} filters · {X} of {Y} tasks" summary line.
 *
 * Assignee and Label options are derived from the real task data rather than
 * free-text inputs. This file stays a thin composition layer — the option
 * builders live in `facet-options.tsx` and the trigger/row primitives in
 * `FacetFilter.tsx`.
 */

"use client";

import { useEffect, useMemo } from "react";
import {
  AlertTriangleIcon,
  ListFilterIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

import { FacetFilter } from "./FacetFilter";
import {
  assigneeFacetOptions,
  labelFacetOptions,
  priorityFacetOptions,
  projectFacetOptions,
  statusFacetOptions,
} from "./facet-options";
import { useProjects } from "./useProjects";
import { useTaskFacets } from "./useTaskFacets";
import type { TaskPriority, TaskStatus } from "./types";

/**
 * The shape of the task-list query the parent tracks. Every faceted dimension
 * is a (possibly empty) array of selected values; `q` is the free-text search
 * and `sort` is the single-select sort field.
 */
export interface TaskQuery {
  q: string;
  status: TaskStatus[];
  priority: TaskPriority[];
  projectId: string[];
  assignee: string[];
  label: string[];
  sort: string;
}

/** A fresh, fully-empty query. Optionally seeds a single project filter. */
export function emptyTaskQuery(projectId?: string): TaskQuery {
  return {
    q: "",
    status: [],
    priority: [],
    projectId: projectId ? [projectId] : [],
    assignee: [],
    label: [],
    sort: "createdAt",
  };
}

/** Count how many facet dimensions (excluding sort) are currently active. */
export function activeFilterCount(value: TaskQuery): number {
  return (
    (value.q.trim() ? 1 : 0) +
    value.status.length +
    value.priority.length +
    value.projectId.length +
    value.assignee.length +
    value.label.length
  );
}

/** The facet dimensions, in bar order, keyed to the `TaskQuery` fields. */
const FACET_KEYS = ["status", "priority", "projectId", "assignee", "label"] as const;
type FacetKey = (typeof FACET_KEYS)[number];

const FACET_LABELS: Record<FacetKey, string> = {
  status: "Status",
  priority: "Priority",
  projectId: "Project",
  assignee: "Assignee",
  label: "Label",
};

export interface TaskFiltersProps {
  value: TaskQuery;
  onChange: (patch: Partial<TaskQuery>) => void;
  onClear: () => void;
  /** How many tasks currently match (rows shown). */
  filtered: number;
  /** Total tasks in the corpus (unfiltered). */
  total: number;
}

/**
 * The faceted filter bar. See the file header for the full anatomy.
 */
export function TaskFilters({ value, onChange, onClear, filtered, total }: TaskFiltersProps) {
  const { options: projectOptions } = useProjects();
  const { assignees, labels, counts, loading, error } = useTaskFacets();

  // Surface facet-load failures for observability. Kept in an effect (not the
  // render body) so it fires once per error rather than on every re-render.
  useEffect(() => {
    if (error) console.error("Failed to load task facets:", error);
  }, [error]);

  const statusFacet = useMemo(() => statusFacetOptions(counts.status), [counts.status]);
  const priorityFacet = useMemo(
    () => priorityFacetOptions(counts.priority),
    [counts.priority],
  );
  const projectFacet = useMemo(
    () => projectFacetOptions(projectOptions, counts.projectId),
    [projectOptions, counts.projectId],
  );
  const assigneeFacet = useMemo(
    () => assigneeFacetOptions(assignees, counts.assignee),
    [assignees, counts.assignee],
  );
  const labelFacet = useMemo(
    () => labelFacetOptions(labels, counts.label),
    [labels, counts.label],
  );

  const activeCount = activeFilterCount(value);

  /** Focus/scroll a facet into view when picked from the "Add filter" menu. */
  function jumpToFacet(key: FacetKey) {
    const el = document.querySelector<HTMLButtonElement>(`[data-facet="${key}"]`);
    el?.focus();
    el?.click();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative min-w-[12rem] flex-1">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            value={value.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder="Search tasks…"
            aria-label="Search tasks"
          />
        </InputGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div data-facet="status">
          <FacetFilter
            label="Status"
            options={statusFacet}
            value={value.status}
            onChange={(next) => onChange({ status: next as TaskStatus[] })}
          />
        </div>
        <div data-facet="priority">
          <FacetFilter
            label="Priority"
            options={priorityFacet}
            value={value.priority}
            onChange={(next) => onChange({ priority: next as TaskPriority[] })}
          />
        </div>
        <div data-facet="projectId">
          <FacetFilter
            label="Project"
            options={projectFacet}
            value={value.projectId}
            onChange={(next) => onChange({ projectId: next })}
          />
        </div>
        <div data-facet="assignee">
          <FacetFilter
            label="Assignee"
            options={assigneeFacet}
            value={value.assignee}
            onChange={(next) => onChange({ assignee: next })}
          />
        </div>
        <div data-facet="label">
          <FacetFilter
            label="Label"
            options={labelFacet}
            value={value.label}
            onChange={(next) => onChange({ label: next })}
          />
        </div>

        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-dashed text-muted-foreground"
              >
                <PlusIcon className="size-3.5" />
                Add filter
              </Button>
            }
          />
          <PopoverContent align="start" className="w-48 gap-0 p-1">
            {FACET_KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start font-normal"
                onClick={() => jumpToFacet(key)}
              >
                {FACET_LABELS[key]}
              </Button>
            ))}
          </PopoverContent>
        </Popover>

        {activeCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-8 text-muted-foreground"
          >
            <XIcon className="size-4" />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ListFilterIcon className="size-3.5" />
        <span className="tabular-nums">
          {activeCount} {activeCount === 1 ? "filter" : "filters"}
        </span>
        <Separator orientation="vertical" className="h-3.5 bg-border/60" />
        <span className="tabular-nums">
          {filtered} of {total} {total === 1 ? "task" : "tasks"}
        </span>
        {error ? (
          <>
            <Separator orientation="vertical" className="h-3.5 bg-border/60" />
            <output className="inline-flex items-center gap-1 text-destructive">
              <AlertTriangleIcon className="size-3.5" />
              Assignee &amp; Label facets unavailable
            </output>
          </>
        ) : loading ? (
          <>
            <Separator orientation="vertical" className="h-3.5 bg-border/60" />
            <span className="text-muted-foreground/70">Loading facets…</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
