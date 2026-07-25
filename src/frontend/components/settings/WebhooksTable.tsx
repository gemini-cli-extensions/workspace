/**
 * @fileoverview WebhooksTable — CRUD + test surface for outbound webhooks.
 *
 * Data flows entirely through the real Hono API:
 *   - GET    /api/webhooks            – list (paginated; we load the first page)
 *   - POST   /api/webhooks            – create (via the add/edit Dialog)
 *   - PATCH  /api/webhooks/{id}       – partial update (Dialog + active toggle)
 *   - DELETE /api/webhooks/{id}       – delete (via AlertDialog confirmation)
 *   - POST   /api/webhooks/{id}/test  – simulate a delivery, surface the result
 *
 * No window.confirm/prompt — destructive delete is gated by an AlertDialog and
 * create/edit happens in a Dialog form. Monolith dark profile throughout.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { PencilIcon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { apiGet, ApiError, apiSend } from "@/lib/api";
import { relativeTime } from "@/lib/format";

import { InlineError } from "./shared";

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  active: boolean;
  lastStatus: string | null;
  lastTriggeredAt: string | number | Date | null;
  createdAt: string | number | Date;
}

interface WebhookListResponse {
  data: Webhook[];
  total: number;
  limit: number;
  offset: number;
}

interface TestResponse {
  ok: boolean;
  lastStatus: string;
  lastTriggeredAt: number | null;
}

/** Editable draft used by the add/edit Dialog. */
interface WebhookDraft {
  name: string;
  url: string;
  events: string;
  active: boolean;
}

const EMPTY_DRAFT: WebhookDraft = { name: "", url: "", events: "", active: true };

/** Split a comma/space separated events string into a clean array. */
function parseEvents(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WebhooksTable() {
  const [rows, setRows] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add/edit dialog state.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WebhookDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  // Delete confirmation state.
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Per-row transient test feedback keyed by webhook id.
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<WebhookListResponse>("webhooks", { limit: 100 });
      setRows(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load webhooks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // --- Add / edit ----------------------------------------------------------

  const openCreate = useCallback(() => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setEditorError(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((wh: Webhook) => {
    setEditingId(wh.id);
    setDraft({
      name: wh.name,
      url: wh.url,
      events: wh.events.join(", "),
      active: wh.active,
    });
    setEditorError(null);
    setEditorOpen(true);
  }, []);

  const submitDraft = useCallback(async () => {
    setSubmitting(true);
    setEditorError(null);
    try {
      const body = {
        name: draft.name.trim(),
        url: draft.url.trim(),
        events: parseEvents(draft.events),
        active: draft.active,
      };
      if (editingId) {
        const updated = await apiSend<Webhook>("PATCH", `webhooks/${editingId}`, body);
        setRows((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      } else {
        const created = await apiSend<Webhook>("POST", "webhooks", body);
        setRows((prev) => [created, ...prev]);
      }
      setEditorOpen(false);
    } catch (e) {
      setEditorError(e instanceof ApiError ? e.message : "Failed to save webhook.");
    } finally {
      setSubmitting(false);
    }
  }, [draft, editingId]);

  // --- Active toggle (inline PATCH) ---------------------------------------

  const toggleActive = useCallback(async (wh: Webhook, active: boolean) => {
    // Optimistic update, rolled back on failure.
    setRows((prev) => prev.map((r) => (r.id === wh.id ? { ...r, active } : r)));
    try {
      const updated = await apiSend<Webhook>("PATCH", `webhooks/${wh.id}`, { active });
      setRows((prev) => prev.map((r) => (r.id === wh.id ? updated : r)));
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.id === wh.id ? { ...r, active: !active } : r)));
      setError(e instanceof ApiError ? e.message : "Failed to update webhook.");
    }
  }, []);

  // --- Delete --------------------------------------------------------------

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiSend<{ ok: boolean }>("DELETE", `webhooks/${deleteTarget.id}`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete webhook.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  // --- Test ----------------------------------------------------------------

  const testWebhook = useCallback(async (wh: Webhook) => {
    setTestingId(wh.id);
    try {
      const res = await apiSend<TestResponse>("POST", `webhooks/${wh.id}/test`, undefined);
      setRows((prev) =>
        prev.map((r) =>
          r.id === wh.id
            ? { ...r, lastStatus: res.lastStatus, lastTriggeredAt: res.lastTriggeredAt }
            : r,
        ),
      );
      setTestResults((prev) => ({ ...prev, [wh.id]: res.lastStatus }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [wh.id]: e instanceof ApiError ? e.message : "Test failed",
      }));
    } finally {
      setTestingId(null);
    }
  }, []);

  return (
    <Card className="bg-card ring-1 ring-border/40">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>
            Outbound HTTP endpoints that receive event payloads. Add, edit, test,
            or remove deliveries.
          </CardDescription>
        </div>
        <Button onClick={openCreate} size="sm">
          <PlusIcon className="size-3.5" />
          Add webhook
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <InlineError message={error} />

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/20 py-12 text-center">
            <p className="text-sm text-muted-foreground">No webhooks registered yet.</p>
            <Button onClick={openCreate} size="sm" variant="outline">
              <PlusIcon className="size-3.5" />
              Add your first webhook
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border/40">
                <TableHead>Name</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Last status</TableHead>
                <TableHead>Last triggered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((wh) => (
                <TableRow key={wh.id} className="border-border/30">
                  <TableCell className="font-medium">{wh.name}</TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                    {wh.url}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {wh.events.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        wh.events.slice(0, 3).map((ev) => (
                          <Badge key={ev} variant="secondary" className="text-[10px]">
                            {ev}
                          </Badge>
                        ))
                      )}
                      {wh.events.length > 3 ? (
                        <Badge variant="outline" className="text-[10px]">
                          +{wh.events.length - 3}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`Toggle ${wh.name}`}
                      checked={wh.active}
                      onCheckedChange={(checked) => void toggleActive(wh, checked)}
                    />
                  </TableCell>
                  <TableCell>
                    {testResults[wh.id] ? (
                      <span className="text-xs text-foreground">{testResults[wh.id]}</span>
                    ) : wh.lastStatus ? (
                      <Badge
                        variant={wh.lastStatus.startsWith("2") ? "default" : "destructive"}
                        className="text-[10px]"
                      >
                        {wh.lastStatus}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {wh.lastTriggeredAt ? relativeTime(wh.lastTriggeredAt) : "never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void testWebhook(wh)}
                        disabled={testingId === wh.id}
                        title="Send test delivery"
                      >
                        <SendIcon className="size-3.5" />
                        {testingId === wh.id ? "Testing…" : "Test"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(wh)}
                        title="Edit webhook"
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(wh)}
                        title="Delete webhook"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Add / edit dialog ----------------------------------------------- */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit webhook" : "Add webhook"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update this webhook's destination and event subscriptions."
                : "Register a new outbound endpoint. A signing secret is generated automatically."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="wh-name">Name</Label>
              <Input
                id="wh-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Deploy notifier"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wh-url">Endpoint URL</Label>
              <Input
                id="wh-url"
                value={draft.url}
                onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                placeholder="https://example.com/hooks/incoming"
                spellCheck={false}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wh-events">Events</Label>
              <Input
                id="wh-events"
                value={draft.events}
                onChange={(e) => setDraft((d) => ({ ...d, events: e.target.value }))}
                placeholder="task.created, project.updated"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Comma- or space-separated event type strings.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="wh-active">Active</Label>
              <Switch
                id="wh-active"
                checked={draft.active}
                onCheckedChange={(checked) => setDraft((d) => ({ ...d, active: checked }))}
              />
            </div>
            <InlineError message={editorError} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={submitDraft}
              disabled={submitting || !draft.name.trim() || !draft.url.trim()}
            >
              {submitting ? "Saving…" : editingId ? "Save changes" : "Create webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation -------------------------------------------- */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span>. Any
              events subscribed to this endpoint will stop being delivered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
