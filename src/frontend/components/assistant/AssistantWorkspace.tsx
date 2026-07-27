/**
 * @fileoverview AssistantWorkspace — the full multi-thread assistant layout.
 *
 * Left: {@link ThreadList} (new / switch / archive / delete). Right: the
 * enhanced {@link Thread} (markdown, suggestions, generative UI). Both share the
 * multi-thread runtime from {@link MultiThreadRuntimeProvider}, so switching
 * threads in the list swaps the active ChatBroker DO conversation on the right.
 *
 * Responsive: on mobile the sidebar collapses into a slide-over toggled by a
 * header button — implemented with base-ui state + Tailwind (no Radix sidebar).
 * Mount `client:only="react"`.
 */

"use client";

import * as React from "react";

import { PanelLeftIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { MultiThreadRuntimeProvider } from "./runtime";
import { Thread } from "./Thread";
import { ThreadList } from "./ThreadList";

/** Sidebar contents (header + thread list), shared by desktop + mobile. */
function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-sm font-semibold tracking-tight text-foreground">Conversations</span>
        {onClose ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 lg:hidden"
            aria-label="Close sidebar"
            onClick={onClose}
          >
            <XIcon className="size-4" />
          </Button>
        ) : null}
      </div>
      <Separator />
      <div className="min-h-0 flex-1">
        <ThreadList />
      </div>
    </div>
  );
}

/** Props for {@link AssistantWorkspace}. */
export interface AssistantWorkspaceProps {
  /** Outer height. Defaults to a tall viewport-relative panel. */
  className?: string;
}

/**
 * The complete threads + chat workspace. Mount once per page.
 */
export function AssistantWorkspace({ className }: AssistantWorkspaceProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <MultiThreadRuntimeProvider>
      <div
        className={cn(
          "relative flex h-[calc(100vh-9rem)] overflow-hidden rounded-2xl bg-card ring-1 ring-border/40",
          className,
        )}
      >
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-border/30 lg:block">
          <Sidebar />
        </aside>

        {/* Mobile slide-over sidebar */}
        {mobileOpen ? (
          <div className="absolute inset-0 z-20 flex lg:hidden">
            <button
              type="button"
              aria-label="Close sidebar overlay"
              className="absolute inset-0 bg-background/70 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="relative z-10 w-64 max-w-[80%] bg-card ring-1 ring-border/40">
              <Sidebar onClose={() => setMobileOpen(false)} />
            </aside>
          </div>
        ) : null}

        {/* Main thread column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2 lg:hidden">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label="Open conversations"
              onClick={() => setMobileOpen(true)}
            >
              <PanelLeftIcon className="size-4" />
            </Button>
            <span className="text-sm font-medium text-foreground">Assistant</span>
          </div>

          <div className="min-h-0 flex-1">
            <Thread />
          </div>
        </div>
      </div>
    </MultiThreadRuntimeProvider>
  );
}
