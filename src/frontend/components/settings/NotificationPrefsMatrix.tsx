/**
 * @fileoverview NotificationPrefsMatrix — channel × category delivery matrix.
 *
 * Loads every (channel, category) preference row from
 * `GET /api/settings/notification-prefs` (the backend seeds a full enabled
 * matrix on first read) and persists the working copy via
 * `PUT /api/settings/notification-prefs`, which accepts an array of
 * `{ channel, category, enabled }`.
 *
 * The matrix renders as a responsive table: categories down the rows, channels
 * across the columns, a Switch at each intersection. Per-row and per-column
 * "toggle all" affordances make bulk edits cheap.
 *
 * Monolith dark profile: shadcn Card/Switch/Button, divided by
 * `divide-border/40`, no traditional 1px borders.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

import { apiGet, ApiError, apiSend } from "@/lib/api";

import { InlineError, SavedFlash, useSavedFlash } from "./shared";

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

const CHANNELS = ["email", "push", "in_app", "sms"] as const;
const CATEGORIES = ["tasks", "mentions", "projects", "system", "billing"] as const;

type Channel = (typeof CHANNELS)[number];
type Category = (typeof CATEGORIES)[number];

interface NotificationPref {
  id: string;
  channel: Channel;
  category: Category;
  enabled: boolean;
  updatedAt: string | number | Date;
}

/** Item shape accepted by PUT /api/settings/notification-prefs. */
interface NotifPrefPatch {
  channel: Channel;
  category: Category;
  enabled: boolean;
}

const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  push: "Push",
  in_app: "In-app",
  sms: "SMS",
};

const CATEGORY_LABELS: Record<Category, string> = {
  tasks: "Tasks",
  mentions: "Mentions",
  projects: "Projects",
  system: "System",
  billing: "Billing",
};

/** Compose a stable map key for a (channel, category) cell. */
function cellKey(channel: Channel, category: Category): string {
  return `${channel}:${category}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationPrefsMatrix() {
  // Working copy keyed by `${channel}:${category}` → enabled.
  const [matrix, setMatrix] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, flashSaved] = useSavedFlash();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiGet<NotificationPref[]>("settings/notification-prefs");
      const next: Record<string, boolean> = {};
      for (const row of rows) {
        next[cellKey(row.channel, row.category)] = row.enabled;
      }
      setMatrix(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load notification preferences.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setCell = useCallback((channel: Channel, category: Category, enabled: boolean) => {
    setMatrix((prev) => ({ ...prev, [cellKey(channel, category)]: enabled }));
  }, []);

  /** Toggle every cell in a category row to `enabled`. */
  const setRow = useCallback((category: Category, enabled: boolean) => {
    setMatrix((prev) => {
      const next = { ...prev };
      for (const channel of CHANNELS) next[cellKey(channel, category)] = enabled;
      return next;
    });
  }, []);

  /** Toggle every cell in a channel column to `enabled`. */
  const setColumn = useCallback((channel: Channel, enabled: boolean) => {
    setMatrix((prev) => {
      const next = { ...prev };
      for (const category of CATEGORIES) next[cellKey(channel, category)] = enabled;
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const body: NotifPrefPatch[] = [];
      for (const channel of CHANNELS) {
        for (const category of CATEGORIES) {
          body.push({
            channel,
            category,
            enabled: matrix[cellKey(channel, category)] ?? false,
          });
        }
      }
      const rows = await apiSend<NotificationPref[]>(
        "PUT",
        "settings/notification-prefs",
        body,
      );
      const next: Record<string, boolean> = {};
      for (const row of rows) next[cellKey(row.channel, row.category)] = row.enabled;
      setMatrix(next);
      flashSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save notification preferences.");
    } finally {
      setSaving(false);
    }
  }, [matrix, flashSaved]);

  /** Whether a channel column is fully enabled (drives its header toggle). */
  const columnAllOn = useMemo(() => {
    const out: Record<Channel, boolean> = {} as Record<Channel, boolean>;
    for (const channel of CHANNELS) {
      out[channel] = CATEGORIES.every((cat) => matrix[cellKey(channel, cat)]);
    }
    return out;
  }, [matrix]);

  return (
    <Card className="bg-card ring-1 ring-border/40">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>Notification preferences</CardTitle>
          <CardDescription>
            Choose which notification categories reach you on each delivery
            channel. Use the row and column toggles for bulk edits.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <SavedFlash show={saved} />
          <Button onClick={save} disabled={saving || loading} size="sm">
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <InlineError message={error} />

        {loading ? (
          <div className="space-y-3">
            {CATEGORIES.map((cat) => (
              <Skeleton key={cat} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="w-44 px-3 py-2 text-left align-bottom text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Category
                  </th>
                  {CHANNELS.map((channel) => (
                    <th key={channel} className="px-3 py-2 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">
                          {CHANNEL_LABELS[channel]}
                        </span>
                        <button
                          type="button"
                          onClick={() => setColumn(channel, !columnAllOn[channel])}
                          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {columnAllOn[channel] ? "Clear" : "All"}
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {CATEGORIES.map((category) => {
                  const rowAllOn = CHANNELS.every((ch) => matrix[cellKey(ch, category)]);
                  return (
                    <tr key={category} className="divide-x divide-border/20">
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {CATEGORY_LABELS[category]}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRow(category, !rowAllOn)}
                            className="self-start text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            {rowAllOn ? "Disable all" : "Enable all"}
                          </button>
                        </div>
                      </td>
                      {CHANNELS.map((channel) => (
                        <td key={channel} className="px-3 py-3 text-center">
                          <div className="flex justify-center">
                            <Switch
                              aria-label={`${CATEGORY_LABELS[category]} via ${CHANNEL_LABELS[channel]}`}
                              checked={matrix[cellKey(channel, category)] ?? false}
                              onCheckedChange={(checked) =>
                                setCell(channel, category, checked)
                              }
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
