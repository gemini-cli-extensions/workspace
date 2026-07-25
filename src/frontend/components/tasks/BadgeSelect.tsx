/**
 * @fileoverview BadgeSelect — a "badge-as-trigger" editor used by the task
 * viewport's Properties sidebar (and header) for Status and Priority.
 *
 * The default (resting) state renders the app's colored pill badge — NOT a raw
 * `<Select>` showing the lowercase enum value. Clicking the badge opens a small
 * Base-UI dropdown menu (radio group) listing the human-labeled options, each
 * rendered as its own colored badge with a check against the current value.
 * Selecting an option fires `onChange(value)` which the parent PATCHes.
 *
 * This keeps Status/Priority *editable* while matching the mockup's colored
 * badge presentation. Pure Base-UI + Monolith dark theme; the trigger is a bare
 * button so the badge itself is the affordance (no surrounding chrome/borders).
 */

"use client";

import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface BadgeSelectOption<T extends string> {
  /** The stored enum value (e.g. `"todo"`). */
  value: T;
  /** The colored badge to render for this option (e.g. `<TaskStatusBadge />`). */
  badge: ReactNode;
}

export interface BadgeSelectProps<T extends string> {
  /** Currently-selected value. */
  value: T;
  /** All selectable options, in display order. */
  options: BadgeSelectOption<T>[];
  /** Fired with the newly-chosen value; the parent performs the PATCH. */
  onChange: (value: T) => void;
  /** Accessible label for the trigger (e.g. "Change status"). */
  ariaLabel: string;
  /** Disable the trigger while a save is in flight. */
  disabled?: boolean;
  className?: string;
}

/**
 * Render the current value as a colored badge that, when clicked, opens a
 * dropdown of colored-badge options. Editable, but resting state is the badge.
 */
export function BadgeSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className,
}: BadgeSelectProps<T>) {
  const current = options.find((o) => o.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          "group/badge-select inline-flex items-center gap-1 rounded-md outline-hidden transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {current?.badge}
        <ChevronDownIcon className="size-3 text-muted-foreground transition-transform group-data-[popup-open]/badge-select:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[9rem]">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as T)}
        >
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.badge}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
