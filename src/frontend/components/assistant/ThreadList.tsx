/**
 * @fileoverview ThreadList — a base-ui thread switcher built on
 * `ThreadListPrimitive` + `ThreadListItemPrimitive` (zero Radix).
 *
 * Renders a "New chat" button and the list of threads. Each item is a row with
 * a switch trigger (title) plus archive / delete affordances revealed on hover.
 * The active thread gets a ring + raised background.
 *
 * Must be rendered inside the multi-thread runtime provider (see `runtime.tsx`)
 * so the New/switch/archive/delete actions resolve. Browser-only.
 */

"use client";

import { ArchiveIcon, MessageSquarePlusIcon, Trash2Icon } from "lucide-react";

import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
} from "@assistant-ui/react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/** A single thread row. */
function ThreadListItem() {
  return (
    <ThreadListItemPrimitive.Root
      className={cn(
        "group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors",
        "ring-1 ring-transparent hover:bg-muted/50",
        "data-[active]:bg-muted/70 data-[active]:ring-border/50",
      )}
    >
      <ThreadListItemPrimitive.Trigger className="flex-1 truncate text-left text-sm text-foreground/80 transition-colors group-hover:text-foreground focus:outline-none data-[active]:text-foreground">
        <ThreadListItemPrimitive.Title fallback="New chat" />
      </ThreadListItemPrimitive.Trigger>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <ThreadListItemPrimitive.Archive asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label="Archive thread"
          >
            <ArchiveIcon className="size-3.5" />
          </Button>
        </ThreadListItemPrimitive.Archive>
        <ThreadListItemPrimitive.Delete asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-rose-400"
            aria-label="Delete thread"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </ThreadListItemPrimitive.Delete>
      </div>
    </ThreadListItemPrimitive.Root>
  );
}

/** Props for {@link ThreadList}. */
export interface ThreadListProps {
  className?: string;
}

/**
 * The thread switcher sidebar content. Render inside the multi-thread runtime
 * provider.
 */
export function ThreadList({ className }: ThreadListProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-2", className)}>
      <ThreadListPrimitive.Root className="flex h-full min-h-0 flex-col gap-2">
        <ThreadListPrimitive.New asChild>
          <Button variant="secondary" className="w-full justify-start gap-2">
            <MessageSquarePlusIcon className="size-4" />
            New chat
          </Button>
        </ThreadListPrimitive.New>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1 pr-2">
            <ThreadListPrimitive.Items components={{ ThreadListItem }} />
          </div>
        </ScrollArea>
      </ThreadListPrimitive.Root>
    </div>
  );
}
