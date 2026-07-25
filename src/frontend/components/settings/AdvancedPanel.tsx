/**
 * @fileoverview AdvancedPanel — system info + danger zone.
 *
 * Surfaces a read-only system status block (from `GET /api/ping`) alongside two
 * tasteful, real actions backed by existing endpoints:
 *   - "Reset appearance" → PUT /api/settings/preferences with the theme/density
 *     defaults (a soft reset, not destructive).
 *   - "Clear notifications" → DELETE /api/notifications, gated behind an
 *     AlertDialog (this also clears the realtime feed via the NotificationsAgent
 *     DO, so the notifications page updates live).
 *
 * No window.confirm — the destructive action is confirmed via AlertDialog.
 * Monolith dark profile throughout; the danger zone is set off with a
 * `ring-1 ring-destructive/30` instead of a hard border.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { RotateCcwIcon, ServerIcon, Trash2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { apiGet, ApiError, apiSend } from "@/lib/api";
import { shortDate } from "@/lib/format";

import { InlineError, SavedFlash, SettingsRow, SettingsRowGroup, useSavedFlash } from "./shared";

interface PingResponse {
  status: string;
  timestamp: number;
}

/** Default appearance values mirrored from the preferences schema defaults. */
const APPEARANCE_DEFAULTS = {
  theme: "system",
  accentColor: "#6366f1",
  fontSize: "md",
  density: "comfortable",
};

export function AdvancedPanel() {
  const [ping, setPing] = useState<PingResponse | null>(null);
  const [pingLoading, setPingLoading] = useState(true);
  const [pingError, setPingError] = useState<string | null>(null);

  const [resetting, setResetting] = useState(false);
  const [reset, flashReset] = useSavedFlash();

  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPing = useCallback(async () => {
    setPingLoading(true);
    setPingError(null);
    try {
      const res = await apiGet<PingResponse>("ping");
      setPing(res);
    } catch (e) {
      setPingError(e instanceof ApiError ? e.message : "Failed to reach the API.");
    } finally {
      setPingLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPing();
  }, [loadPing]);

  const resetAppearance = useCallback(async () => {
    setResetting(true);
    setActionError(null);
    try {
      await apiSend("PUT", "settings/preferences", APPEARANCE_DEFAULTS);
      flashReset();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Failed to reset appearance.");
    } finally {
      setResetting(false);
    }
  }, [flashReset]);

  const clearNotifications = useCallback(async () => {
    setClearing(true);
    setActionError(null);
    try {
      await apiSend<{ ok: boolean }>("DELETE", "notifications");
      setClearOpen(false);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Failed to clear notifications.");
    } finally {
      setClearing(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* System info -------------------------------------------------------- */}
      <Card className="bg-card ring-1 ring-border/40">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ServerIcon className="size-4 text-muted-foreground" />
              System
            </CardTitle>
            <CardDescription>
              Read-only status reported by the Worker edge runtime.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={loadPing} disabled={pingLoading}>
            {pingLoading ? "Pinging…" : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          <InlineError message={pingError} />
          {pingLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : ping ? (
            <dl className="grid gap-4 rounded-md bg-muted/30 p-4 ring-1 ring-foreground/5 sm:grid-cols-3">
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">API status</dt>
                <dd>
                  <Badge variant={ping.status === "ok" ? "default" : "destructive"}>
                    {ping.status}
                  </Badge>
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Server time</dt>
                <dd className="text-sm">{new Date(ping.timestamp).toLocaleTimeString()}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Date</dt>
                <dd className="text-sm">{shortDate(ping.timestamp)}</dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {/* Maintenance -------------------------------------------------------- */}
      <Card className="bg-card ring-1 ring-border/40">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Maintenance</CardTitle>
            <CardDescription>Soft resets that restore default state.</CardDescription>
          </div>
          <SavedFlash show={reset} label="Reset" />
        </CardHeader>
        <CardContent>
          <SettingsRowGroup>
            <SettingsRow
              label="Reset appearance"
              description="Restore theme, accent, font size, and density to their defaults."
              control={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetAppearance}
                  disabled={resetting}
                >
                  <RotateCcwIcon className="size-3.5" />
                  {resetting ? "Resetting…" : "Reset"}
                </Button>
              }
            />
          </SettingsRowGroup>
        </CardContent>
      </Card>

      {/* Danger zone -------------------------------------------------------- */}
      <Card className="bg-card ring-1 ring-destructive/30">
        <CardHeader className="space-y-1">
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            These actions take effect immediately and cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InlineError message={actionError} />
          <SettingsRowGroup>
            <SettingsRow
              label="Clear all notifications"
              description="Permanently removes every notification from the realtime feed. Connected clients update live."
              control={
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setClearOpen(true)}
                >
                  <Trash2Icon className="size-3.5" />
                  Clear notifications
                </Button>
              }
            />
          </SettingsRowGroup>
        </CardContent>
      </Card>

      {/* Clear confirmation ------------------------------------------------- */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every notification from the feed. The change
              propagates in realtime to all connected clients. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={clearNotifications}
              disabled={clearing}
            >
              {clearing ? "Clearing…" : "Clear notifications"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
