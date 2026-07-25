/**
 * @fileoverview MessageView — the inbox right (reading) pane.
 *
 * Shows the full selected email: sender, recipient, subject, absolute date,
 * label chips, and the body (HTML when present, else plain text). Exposes
 * star / archive / move-to-inbox / back actions. Marking-as-read on open is
 * handled by the parent island (so the unread count stays in sync).
 */

import {
  ArchiveIcon,
  ArrowLeftIcon,
  InboxIcon,
  MailOpenIcon,
  StarIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import type { EmailMessage } from "./types";
import { senderInitials, senderLabel } from "./types";

export interface MessageViewProps {
  message: EmailMessage | null;
  /** Mobile back-to-list handler (hidden on desktop). */
  onBack?: () => void;
  onToggleStar: (msg: EmailMessage) => void;
  onArchive: (msg: EmailMessage) => void;
  onMoveToInbox: (msg: EmailMessage) => void;
}

/** Absolute date like "Jun 30, 2026, 9:14 AM". */
function fullDate(value: number | string): string {
  const d = new Date(typeof value === "number" ? value : new Date(value).getTime());
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Empty placeholder shown on desktop when no message is selected. */
function NoSelection() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <MailOpenIcon className="size-10 text-muted-foreground/60" />
      <div className="space-y-1">
        <p className="text-sm font-medium">No message selected</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
          Pick an email from the list to read it here.
        </p>
      </div>
    </div>
  );
}

/** The reading pane for a single email. */
export function MessageView({
  message,
  onBack,
  onToggleStar,
  onArchive,
  onMoveToInbox,
}: MessageViewProps) {
  if (!message) return <NoSelection />;

  const label = senderLabel(message);
  return (
    <div className="flex h-full flex-col">
      {/* Action bar */}
      <div className="flex items-center gap-1 px-4 py-2.5">
        {onBack ? (
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={onBack}
            aria-label="Back to list"
          >
            <ArrowLeftIcon className="size-4" />
            Back
          </Button>
        ) : null}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          aria-label={message.starred ? "Unstar" : "Star"}
          aria-pressed={message.starred}
          onClick={() => onToggleStar(message)}
        >
          <StarIcon className={cn("size-4", message.starred && "fill-amber-400 text-amber-400")} />
        </Button>
        {message.folder === "archive" ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Move to inbox"
            onClick={() => onMoveToInbox(message)}
          >
            <InboxIcon className="size-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Archive"
            onClick={() => onArchive(message)}
          >
            <ArchiveIcon className="size-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-5 pb-10 pt-2">
          <h1 className="text-xl font-semibold tracking-tight">{message.subject}</h1>

          <div className="flex items-start gap-3">
            <Avatar size="lg">
              <AvatarFallback>
                {senderInitials(message.fromName, message.fromAddress)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  &lt;{message.fromAddress}&gt;
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                to {message.toAddress} · {fullDate(message.receivedAt)}
              </div>
              {message.labels.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {message.labels.map((l) => (
                    <Badge key={l} variant="secondary" className="font-normal">
                      {l}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl bg-muted/20 p-5 ring-1 ring-border/40">
            {message.htmlBody ? (
              <div
                className="prose prose-sm prose-invert max-w-none break-words [&_a]:text-primary"
                // Showcase content is from our own seed + parsed inbound mail.
                // For untrusted production mail, sanitize before rendering.
                dangerouslySetInnerHTML={{ __html: message.htmlBody }}
              />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/90">
                {message.textBody}
              </pre>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
