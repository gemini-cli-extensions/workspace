/**
 * @fileoverview NotificationsFeed — realtime notification inbox wired to the
 * `NotificationsAgent` Durable Object over a WebSocket state channel.
 *
 * This island opens a long-lived socket via `useAgent` from `agents/react` and
 * subscribes to the agent's server-authoritative state `{ notifications, unread }`.
 * There is **no chat / inference** here — `NotificationsAgent` is a plain
 * Agents SDK `Agent` that pushes state to every connected client whenever it
 * calls `setState` on the server. New notifications, read-state changes, and
 * clears all arrive in realtime with no polling.
 *
 * Routing: the agent name is the **kebab-case of the DO class name**, so the SDK
 * routes this socket to `/agents/notifications-agent/global`. `"global"` is the
 * single canonical instance for this single-user template.
 *
 * Styling follows the Monolith dark profile used by `AgentChat.tsx`: shadcn
 * Card/Badge/Button primitives, no hard 1px borders (we use `ring-1
 * ring-border/40` + `bg-card`).
 */

"use client";

import { useState } from "react";

import {
  AlertTriangleIcon,
  BellIcon,
  CheckCheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  type LucideIcon,
  MessageSquareIcon,
  SettingsIcon,
} from "lucide-react";

import { useAgent } from "agents/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Wire types — kept structurally in sync with the agent's NotificationItem.
// (Duplicated here rather than imported so this client island has no backend
// import edge; the server is the source of truth for the shape.)
// ---------------------------------------------------------------------------

type NotificationType =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "mention"
  | "system";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  severity: string;
  read: boolean;
  actor: string | null;
  entityType: string | null;
  entityId: string | null;
  href: string | null;
  /** Unix epoch milliseconds. */
  createdAt: number;
}

interface NotificationsState {
  notifications: NotificationItem[];
  unread: number;
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  info: InfoIcon,
  success: CircleCheckIcon,
  warning: AlertTriangleIcon,
  error: CircleAlertIcon,
  mention: MessageSquareIcon,
  system: SettingsIcon,
};

/** Tailwind color class for the type/severity icon. */
const TYPE_TONE: Record<NotificationType, string> = {
  info: "text-sky-400",
  success: "text-emerald-400",
  warning: "text-amber-400",
  error: "text-rose-400",
  mention: "text-violet-400",
  system: "text-muted-foreground",
};

/** Format a millisecond timestamp as a compact relative string. */
function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationsFeed() {
  // Local mirror of the agent's synced state. `useAgent` also exposes
  // `agent.state`, but we keep an explicit copy seeded via `onStateUpdate` so
  // the initial undefined → first-sync transition renders cleanly.
  const [feed, setFeed] = useState<NotificationsState>({
    notifications: [],
    unread: 0,
  });

  // Open the WebSocket to the NotificationsAgent DO. `notifications-agent` is
  // the kebab-case of the class name and must match the SDK route
  // `/agents/notifications-agent/global`. `"global"` is the single shared feed.
  const agent = useAgent<NotificationsState>({
    agent: "notifications-agent",
    name: "global",
    onStateUpdate: (state) => setFeed(state),
  });

  // PartySocket readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED.
  const status =
    agent.readyState === 1
      ? "live"
      : agent.readyState === 0
        ? "connecting"
        : "offline";

  const markAllRead = () => {
    void agent.call("markAllRead", []);
  };

  const markRead = (id: string) => {
    void agent.call("markRead", [id]);
  };

  const hasItems = feed.notifications.length > 0;

  return (
    <Card className="flex h-[calc(100vh-12rem)] flex-col bg-card ring-1 ring-border/40">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="flex items-start gap-3">
          <span className="relative mt-0.5">
            <BellIcon className="size-5 text-muted-foreground" />
            {feed.unread > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {feed.unread > 9 ? "9+" : feed.unread}
              </span>
            ) : null}
          </span>
          <div>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Realtime feed synced from the NotificationsAgent Durable Object over
              a WebSocket state channel.
            </CardDescription>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Badge
            variant={
              status === "live"
                ? "default"
                : status === "connecting"
                  ? "secondary"
                  : "outline"
            }
          >
            {status}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={markAllRead}
            disabled={feed.unread === 0}
          >
            <CheckCheckIcon className="size-3.5" />
            Mark all read
          </Button>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
        {hasItems ? (
          <ul className="divide-y divide-border/30">
            {feed.notifications.map((item) => {
              const Icon = TYPE_ICON[item.type] ?? InfoIcon;
              const tone = TYPE_TONE[item.type] ?? "text-muted-foreground";
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 px-6 py-3 transition-colors hover:bg-muted/30",
                    item.read ? "opacity-70" : "bg-muted/10",
                  )}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      {!item.read ? (
                        <span
                          className="size-2 shrink-0 rounded-full bg-primary"
                          aria-label="unread"
                        />
                      ) : null}
                    </div>
                    {item.body ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {item.body}
                      </p>
                    ) : null}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{relativeTime(item.createdAt)}</span>
                      {item.actor ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate">{item.actor}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {!item.read ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => markRead(item.id)}
                    >
                      Read
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
            <BellIcon className="size-8 opacity-40" />
            <p className="text-sm">No notifications yet.</p>
            <p className="text-xs">
              New events stream in live over
              wss://&hellip;/agents/notifications-agent/global
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
