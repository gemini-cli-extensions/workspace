/**
 * @fileoverview SendTestNotification — composer that POSTs to /api/notifications.
 *
 * Because the notifications REST router proxies through the NotificationsAgent
 * Durable Object, a successful POST is reflected in realtime to every connected
 * WebSocket client — including the `<NotificationsFeed />` rendered alongside
 * this control on the notifications page. There is therefore no local state to
 * reconcile here; we just fire the request and let the DO push the update.
 *
 * Monolith dark profile: shadcn Card/Select/Input/Button, no 1px borders.
 */

"use client";

import { useCallback, useState } from "react";

import { SendIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { apiSend, ApiError } from "@/lib/api";

import { InlineError, SavedFlash, useSavedFlash } from "./shared";

type NotificationType = "info" | "success" | "warning" | "error" | "mention" | "system";

const TYPE_OPTIONS: { value: NotificationType; label: string }[] = [
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "mention", label: "Mention" },
  { value: "system", label: "System" },
];

export function SendTestNotification() {
  const [type, setType] = useState<NotificationType>("info");
  const [title, setTitle] = useState("Test notification");
  const [body, setBody] = useState("Streamed live from the NotificationsAgent DO.");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, flashSent] = useSavedFlash();

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      await apiSend("POST", "notifications", {
        type,
        title: title.trim() || "Test notification",
        body: body.trim() || null,
        actor: "you",
      });
      flashSent();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to send notification.");
    } finally {
      setSending(false);
    }
  }, [type, title, body, flashSent]);

  return (
    <Card className="bg-card ring-1 ring-border/40">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Send a test notification</CardTitle>
        <CardDescription>
          POSTs to <code className="text-xs">/api/notifications</code>, which proxies to the
          NotificationsAgent DO — the feed updates live over its WebSocket.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor="notif-type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => typeof v === "string" && setType(v as NotificationType)}
            >
              <SelectTrigger id="notif-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notif-title">Title</Label>
            <Input
              id="notif-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="notif-body">Body</Label>
          <Input
            id="notif-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Optional message body"
          />
        </div>

        <InlineError message={error} />

        <div className="flex items-center gap-3">
          <Button onClick={send} disabled={sending} size="sm">
            <SendIcon className="size-3.5" />
            {sending ? "Sending…" : "Send test notification"}
          </Button>
          <SavedFlash show={sent} label="Sent" />
        </div>
      </CardContent>
    </Card>
  );
}
