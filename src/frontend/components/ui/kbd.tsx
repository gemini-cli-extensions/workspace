/**
 * @fileoverview Kbd — a tiny inline keyboard-hint chip. No external dependency;
 * just a styled `<kbd>` tuned for the dark Monolith theme (ring-based surface,
 * no 1px border). Used by {@link file://./rich-text-composer.tsx} to annotate
 * toolbar shortcuts (⌘B, ⌘↵, …).
 */

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Render a small keyboard-key chip.
 *
 * @example
 * <Kbd>⌘</Kbd><Kbd>B</Kbd>
 */
export function Kbd({ className, children, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded bg-muted/60 px-1",
        "font-mono text-[10px] leading-none text-muted-foreground ring-1 ring-border/40",
        "select-none",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

export default Kbd;
