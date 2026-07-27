/**
 * @fileoverview Dashboard filter bar — search + range + status.
 *
 * A controlled toolbar that lifts all filter state to the parent
 * {@link AdminDashboard}. The text input is debounced at the parent level
 * (see `useDebounced`) so the raw keystroke value lives here for instant
 * feedback while the network only sees the settled value.
 *
 * Monolith styling: the bar is a `bg-card` surface with `ring-1 ring-border/40`
 * (no traditional borders). Controls sit on a single responsive row that wraps
 * gracefully on mobile.
 */

"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { RangeValue, StatusValue } from "./types";

const RANGE_OPTIONS: { value: RangeValue; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const STATUS_OPTIONS: { value: StatusValue; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "done", label: "Done" },
];

export interface FilterBarProps {
  q: string;
  range: RangeValue;
  status: StatusValue;
  onQChange: (q: string) => void;
  onRangeChange: (range: RangeValue) => void;
  onStatusChange: (status: StatusValue) => void;
}

/** Search + time-range + status toolbar driving every dashboard query. */
export function FilterBar({
  q,
  range,
  status,
  onQChange,
  onRangeChange,
  onStatusChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-card p-4 ring-1 ring-border/40 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Label htmlFor="dashboard-search" className="sr-only">
          Search activity and tasks
        </Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="dashboard-search"
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            placeholder="Search activity, tasks, actors…"
            className="pl-9"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dashboard-range" className="text-xs text-muted-foreground">
          Range
        </Label>
        <Select value={range} onValueChange={(v) => onRangeChange(v as RangeValue)}>
          <SelectTrigger id="dashboard-range" className="w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dashboard-status" className="text-xs text-muted-foreground">
          Status
        </Label>
        <Select value={status} onValueChange={(v) => onStatusChange(v as StatusValue)}>
          <SelectTrigger id="dashboard-status" className="w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
