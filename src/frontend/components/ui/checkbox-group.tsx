/**
 * @fileoverview CheckboxGroup — a thin shadcn-style wrapper around Base-UI's
 * `@base-ui/react/checkbox-group`. It provides a shared, controlled multi-select
 * state (`value: string[]` + `onValueChange`) to a set of {@link Checkbox}
 * children whose `name` prop is the value they toggle in the group.
 *
 * This mirrors the styling contract of our {@link Checkbox} wrapper (Monolith
 * dark theme, ring-based focus, no 1px separators). It adds no npm dependency —
 * `@base-ui/react` is already installed — and is used by the Tasks faceted
 * filter to back each facet's multi-select option list.
 *
 * Usage:
 * ```tsx
 * <CheckboxGroup value={selected} onValueChange={setSelected}>
 *   <label>
 *     <Checkbox name="todo" />
 *     To Do
 *   </label>
 * </CheckboxGroup>
 * ```
 */

"use client";

import { CheckboxGroup as CheckboxGroupPrimitive } from "@base-ui/react/checkbox-group";

import { cn } from "@/lib/utils";

/**
 * A controlled multi-select checkbox group. `value` holds the `name`s of the
 * currently-ticked child checkboxes; `onValueChange` receives the next array
 * whenever any child toggles. The second Base-UI `eventDetails` argument is
 * dropped so callers get a clean `(value: string[]) => void` signature.
 */
function CheckboxGroup({
  className,
  onValueChange,
  ...props
}: Omit<CheckboxGroupPrimitive.Props, "onValueChange"> & {
  onValueChange?: (value: string[]) => void;
}) {
  return (
    <CheckboxGroupPrimitive
      data-slot="checkbox-group"
      className={cn("flex flex-col", className)}
      onValueChange={onValueChange ? (value) => onValueChange(value) : undefined}
      {...props}
    />
  );
}

export { CheckboxGroup };
