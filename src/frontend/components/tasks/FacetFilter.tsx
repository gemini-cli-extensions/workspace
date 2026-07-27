/**
 * @fileoverview FacetFilter — a reusable Linear/devl.dev-style faceted filter.
 *
 * A single facet renders as an outline {@link Button} trigger ({@link FacetTrigger})
 * that is **dashed when empty** and **solid when active**, showing the facet
 * label, a count badge of how many values are selected, and up to two selected
 * value chips (a "+N" chip absorbs the remainder). Clicking it opens a Base-UI
 * {@link Popover} whose body is an optional search box ({@link FacetSearch}, an
 * `InputGroup`) plus a {@link CheckboxGroup} of option rows ({@link FacetRow} —
 * a {@link Checkbox} + a leading visual + label + a **per-option count**). A
 * footer surfaces a Clear button and an "{n} selected" indicator.
 *
 * This is a fully controlled component — the parent owns `value` and receives
 * the next array via `onChange`. It is intentionally backend-agnostic: each
 * option carries an optional `render` to draw a status dot, priority dot, label
 * chip, or assignee avatar inline in both the trigger chips and the list, plus
 * an optional `count` computed from the loaded task corpus.
 *
 * Built entirely on the project's Base-UI primitives (Popover, CheckboxGroup,
 * Checkbox, Badge, Separator, InputGroup) — zero Radix, Monolith dark theme
 * (ring-based separation, no 1px borders).
 */

"use client";

import { useMemo, useState, type ReactNode } from "react";
import { PlusCircleIcon, SearchIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single selectable option within a facet. */
export interface FacetOption {
  /** The stable value persisted into the query array. */
  value: string;
  /** Human label shown in the option row and (by default) the trigger chip. */
  label: string;
  /**
   * Optional custom renderer for the option's leading visual (status dot,
   * priority dot, label chip, assignee avatar). Receives a `context` so the
   * same option can render slightly differently inside the trigger chip vs. the
   * popover list row if desired.
   */
  render?: (ctx: { context: "trigger" | "list" }) => ReactNode;
  /** Per-option occurrence count across the loaded task corpus. */
  count?: number;
  /** Optional keyword string appended to the label for search matching. */
  keywords?: string;
}

export interface FacetFilterProps {
  /** Facet label, e.g. "Status", "Assignee". */
  label: string;
  /** All selectable options. */
  options: FacetOption[];
  /** Currently selected values (controlled). */
  value: string[];
  /** Called with the next selection array whenever a checkbox toggles. */
  onChange: (next: string[]) => void;
  /**
   * Show an in-popover search box. Defaults to auto: enabled when there are
   * more than 8 options (assignee / label facets).
   */
  searchable?: boolean;
  /** Placeholder for the search box. */
  searchPlaceholder?: string;
  /** Optional className on the trigger button. */
  className?: string;
}

// ---------------------------------------------------------------------------
// FacetTrigger — the outline trigger with count badge + selection chips
// ---------------------------------------------------------------------------

interface FacetTriggerContentProps {
  label: string;
  /** The options matching the current selection, in selection-stable order. */
  selected: FacetOption[];
}

/** Max value chips rendered inline before collapsing into a "+N" chip. */
const MAX_CHIPS = 2;

/**
 * The INNER content of the facet trigger (icon + label + count badge + value
 * chips). This is rendered as the CHILDREN of a {@link Button} that is itself
 * the Base-UI `PopoverTrigger` `render` target — mirroring the working
 * "Add filter" trigger. It deliberately does NOT wrap its own `<Button>`:
 * Base-UI injects the trigger props (onClick, `aria-haspopup`, ref) into the
 * `render` element, and only a real forwarding element (our Base-UI `Button`)
 * propagates them to the DOM. A custom wrapper component here would swallow
 * those props and leave the trigger dead (the original bug).
 */
function FacetTriggerContent({ label, selected }: FacetTriggerContentProps) {
  const count = selected.length;
  const active = count > 0;
  const chips = selected.slice(0, MAX_CHIPS);
  const overflow = count - chips.length;

  return (
    <>
      <PlusCircleIcon className="size-3.5 text-muted-foreground" />
      <span>{label}</span>
      {active ? (
        <>
          <Separator orientation="vertical" className="mx-0.5 h-4 bg-border/60" />
          <Badge
            variant="secondary"
            className="rounded-sm px-1 font-normal tabular-nums lg:hidden"
          >
            {count}
          </Badge>
          <span className="hidden items-center gap-1 lg:flex">
            {chips.map((opt) => (
              <Badge
                key={opt.value}
                variant="secondary"
                className="rounded-sm px-1 font-normal"
              >
                {opt.render ? opt.render({ context: "trigger" }) : opt.label}
              </Badge>
            ))}
            {overflow > 0 ? (
              <Badge variant="secondary" className="rounded-sm px-1 font-normal tabular-nums">
                +{overflow}
              </Badge>
            ) : null}
          </span>
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// FacetSearch — the in-popover search field
// ---------------------------------------------------------------------------

interface FacetSearchProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

/** Compact search input rendered at the top of a searchable facet popover. */
function FacetSearch({ value, onChange, placeholder }: FacetSearchProps) {
  return (
    <InputGroup className="h-8">
      <InputGroupAddon>
        <SearchIcon className="size-3.5" />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        aria-label={placeholder ?? "Search options"}
      />
    </InputGroup>
  );
}

// ---------------------------------------------------------------------------
// FacetRow — a single option row (checkbox + visual + label + count)
// ---------------------------------------------------------------------------

interface FacetRowProps {
  option: FacetOption;
}

/**
 * A single option row inside the popover list. The whole row is a `<label>` so
 * clicking anywhere toggles its {@link Checkbox} (whose `name` is the option
 * value, contributing to the enclosing {@link CheckboxGroup}). The leading
 * visual + label sit on the left; the per-option count is right-aligned.
 */
function FacetRow({ option }: FacetRowProps) {
  return (
    <label
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        "hover:bg-muted has-data-[checked]:bg-muted/60",
      )}
    >
      <Checkbox name={option.value} />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {option.render ? (
          option.render({ context: "list" })
        ) : (
          <span className="truncate">{option.label}</span>
        )}
      </span>
      {option.count != null ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {option.count}
        </span>
      ) : null}
    </label>
  );
}

// ---------------------------------------------------------------------------
// FacetFilter — the orchestrator
// ---------------------------------------------------------------------------

/**
 * A reusable multi-select facet filter. See the file header for behavior.
 */
export function FacetFilter({
  label,
  options,
  value,
  onChange,
  searchable,
  searchPlaceholder,
  className,
}: FacetFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const showSearch = searchable ?? options.length > 8;

  // The selected options in the order they appear in `value` (stable chips).
  const selectedOptions = useMemo(() => {
    const byValue = new Map(options.map((o) => [o.value, o]));
    return value.map((v) => byValue.get(v) ?? { value: v, label: v });
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [options, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 border-dashed",
              selectedOptions.length > 0 && "border-solid",
              className,
            )}
          >
            <FacetTriggerContent label={label} selected={selectedOptions} />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 gap-0 p-0">
        {showSearch ? (
          <div className="p-2">
            <FacetSearch
              value={query}
              onChange={setQuery}
              placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`}
            />
          </div>
        ) : null}

        <ScrollArea className="max-h-64">
          <CheckboxGroup
            value={value}
            onValueChange={onChange}
            aria-label={label}
            className="gap-0 p-1"
          >
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No matches
              </p>
            ) : (
              filtered.map((opt) => <FacetRow key={opt.value} option={opt} />)
            )}
          </CheckboxGroup>
        </ScrollArea>

        <Separator className="bg-border/40" />
        <div className="flex items-center justify-between gap-2 p-1.5">
          <span className="pl-1 text-xs text-muted-foreground tabular-nums">
            {value.length} selected
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            disabled={value.length === 0}
            onClick={() => onChange([])}
          >
            <XIcon className="size-3.5" />
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
