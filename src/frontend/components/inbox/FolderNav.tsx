/**
 * @fileoverview FolderNav — the inbox view switcher (Inbox / Starred / Archive).
 *
 * Renders as a vertical list on desktop and a horizontal segmented row on
 * mobile. Shows the live unread badge on the Inbox view.
 */

import { ArchiveIcon, InboxIcon, StarIcon } from "lucide-react";
import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { InboxView } from "./types";

interface ViewDef {
  view: InboxView;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const VIEWS: ViewDef[] = [
  { view: "inbox", label: "Inbox", icon: InboxIcon },
  { view: "starred", label: "Starred", icon: StarIcon },
  { view: "archive", label: "Archive", icon: ArchiveIcon },
];

export interface FolderNavProps {
  active: InboxView;
  unread: number;
  onChange: (view: InboxView) => void;
  /** Layout: "sidebar" (vertical, desktop) or "segmented" (horizontal, mobile). */
  orientation?: "sidebar" | "segmented";
}

/** View switcher for the inbox. */
export function FolderNav({ active, unread, onChange, orientation = "sidebar" }: FolderNavProps) {
  const segmented = orientation === "segmented";
  return (
    <nav
      aria-label="Mail folders"
      className={cn(segmented ? "flex gap-1" : "flex flex-col gap-1")}
    >
      {VIEWS.map(({ view, label, icon: Icon }) => {
        const isActive = view === active;
        return (
          <button
            key={view}
            type="button"
            onClick={() => onChange(view)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              segmented ? "flex-1 justify-center" : "w-full",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className={cn(segmented && "sr-only sm:not-sr-only")}>{label}</span>
            {view === "inbox" && unread > 0 ? (
              <Badge variant="secondary" className="ml-auto h-5 min-w-5 justify-center px-1.5 tabular-nums">
                {unread}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
