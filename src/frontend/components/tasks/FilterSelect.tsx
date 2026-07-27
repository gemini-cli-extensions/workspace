/**
 * @fileoverview FilterSelect — a thin wrapper over the Base-UI shadcn Select
 * tuned for filter bars. It always includes an "All" sentinel option and maps
 * that sentinel to `undefined` so callers can feed the value straight into the
 * `qs()` query-string builder (which drops undefined keys).
 *
 * Base-UI's Select uses `value` + `onValueChange(value)` (NOT Radix's
 * `onValueChange(string)` shape — the signature is the same here but the second
 * `eventDetails` arg is ignored).
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** The sentinel value used internally to represent "no filter". */
const ALL = "__all__";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  /** Current value, or undefined for "All". */
  value: string | undefined;
  /** Called with the new value, or undefined when "All" is chosen. */
  onChange: (value: string | undefined) => void;
  options: FilterOption[];
  /** Label rendered for the "All" sentinel, e.g. "All statuses". */
  allLabel: string;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  size?: "sm" | "default";
  "aria-label"?: string;
}

/** A single-select filter dropdown with a built-in "All" option. */
export function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  placeholder,
  className,
  triggerClassName,
  size = "sm",
  ...rest
}: FilterSelectProps) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL || next == null ? undefined : String(next))}
    >
      <SelectTrigger
        size={size}
        aria-label={rest["aria-label"]}
        className={cn("min-w-[8.5rem]", triggerClassName, className)}
      >
        <SelectValue placeholder={placeholder ?? allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
