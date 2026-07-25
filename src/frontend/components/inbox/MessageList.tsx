/**
 * @fileoverview MessageList — the inbox left pane.
 *
 * Renders the message rows for the active view (Inbox / Starred / Archive)
 * with sender avatar, name, subject, snippet, relative time, an unread dot, and
 * a star toggle. Pure presentational + selection callbacks; data fetching lives
 * in the parent `Inbox` island.
 */

import { StarIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";

import type { EmailMessage } from "./types";
import { senderInitials, senderLabel } from "./types";

export interface MessageListProps {
  messages: EmailMessage[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (msg: EmailMessage) => void;
  onToggleStar: (msg: EmailMessage) => void;
}

/** Skeleton placeholder rows shown during the initial load. */
function ListSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border/40">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A single message row in the list pane. */
function MessageRow({
  msg,
  selected,
  onSelect,
  onToggleStar,
}: {
  msg: EmailMessage;
  selected: boolean;
  onSelect: (msg: EmailMessage) => void;
  onToggleStar: (msg: EmailMessage) => void;
}) {
  const label = senderLabel(msg);
  // The row is a positioning container. A full-area select button sits *under*
  // the content (so the whole row is clickable) while the star button layers on
  // top — no nested interactive elements, which keeps a11y semantics clean.
  return (
    <div
      className={cn(
        "group/row relative flex items-start gap-3 px-4 py-3 transition-colors",
        "hover:bg-muted/40 has-[button:focus-visible]:bg-muted/40",
        selected && "bg-muted/60",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(msg)}
        aria-current={selected ? "true" : undefined}
        aria-label={`Open email from ${label}: ${msg.subject}`}
        className="absolute inset-0 z-0 focus-visible:outline-none"
      />

      <div className="pointer-events-none relative z-10">
        <Avatar size="default">
          <AvatarFallback>{senderInitials(msg.fromName, msg.fromAddress)}</AvatarFallback>
        </Avatar>
        {!msg.read ? (
          <span
            aria-hidden
            className="absolute -left-1.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary"
          />
        ) : null}
      </div>

      <div className="pointer-events-none relative z-10 min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              msg.read ? "font-normal text-foreground/90" : "font-semibold text-foreground",
            )}
          >
            {label}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {relativeTime(msg.receivedAt)}
          </span>
        </div>
        <div
          className={cn(
            "truncate text-sm",
            msg.read ? "text-muted-foreground" : "font-medium text-foreground",
          )}
        >
          {msg.subject}
        </div>
        <div className="truncate text-xs text-muted-foreground">{msg.snippet}</div>
      </div>

      <button
        type="button"
        aria-label={msg.starred ? "Unstar message" : "Star message"}
        aria-pressed={msg.starred}
        onClick={() => onToggleStar(msg)}
        className={cn(
          "relative z-10 mt-0.5 shrink-0 rounded p-1 text-muted-foreground transition-colors",
          "hover:text-amber-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          msg.starred && "text-amber-400",
        )}
      >
        <StarIcon className={cn("size-4", msg.starred && "fill-current")} />
      </button>
    </div>
  );
}

/** The scrollable message list for the active view. */
export function MessageList({
  messages,
  selectedId,
  loading,
  onSelect,
  onToggleStar,
}: MessageListProps) {
  if (loading) return <ListSkeleton />;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col divide-y divide-border/40">
        {messages.map((msg) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            selected={msg.id === selectedId}
            onSelect={onSelect}
            onToggleStar={onToggleStar}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
