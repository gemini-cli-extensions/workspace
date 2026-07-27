/**
 * @fileoverview TemplatesManager — CRUD surface for the template-artifacts
 * registry (reusable Google Drive templates agents can reference).
 *
 *   - GET    /api/gws/templates      – list (SSR-seeded, refetched after writes)
 *   - POST   /api/gws/templates      – create (Dialog form)
 *   - PUT    /api/gws/templates/{id} – update (same Dialog form, prefilled)
 *   - DELETE /api/gws/templates/{id} – delete (AlertDialog confirmation)
 *
 * Mirrors the WebhooksTable pattern: Dialog for add/edit, AlertDialog for
 * delete, no window.confirm/prompt.
 */

"use client";

import { useCallback, useState } from "react";

import { ExternalLinkIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { apiSend, ApiError } from "@/lib/api";

const TEMPLATE_TYPES = ["doc", "sheet", "slide", "form", "drive"] as const;
type TemplateType = (typeof TEMPLATE_TYPES)[number];

export interface TemplateArtifact {
  id: string;
  name: string;
  description: string | null;
  templateType: TemplateType;
  driveId: string;
  driveUrl: string;
  tags: string[] | null;
  createdAt: string | number;
  updatedAt: string | number;
}

interface TemplateDraft {
  name: string;
  description: string;
  templateType: TemplateType;
  driveId: string;
  driveUrl: string;
  tags: string;
}

const EMPTY_DRAFT: TemplateDraft = {
  name: "",
  description: "",
  templateType: "doc",
  driveId: "",
  driveUrl: "",
  tags: "",
};

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function TemplatesManager({ templates: initial }: { templates: TemplateArtifact[] }) {
  const [rows, setRows] = useState<TemplateArtifact[]>(initial);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TemplateArtifact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setEditorError(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((t: TemplateArtifact) => {
    setEditingId(t.id);
    setDraft({
      name: t.name,
      description: t.description ?? "",
      templateType: t.templateType,
      driveId: t.driveId,
      driveUrl: t.driveUrl,
      tags: (t.tags ?? []).join(", "),
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
        description: draft.description.trim() || null,
        templateType: draft.templateType,
        driveId: draft.driveId.trim(),
        driveUrl: draft.driveUrl.trim(),
        tags: parseTags(draft.tags),
      };
      if (editingId) {
        const updated = await apiSend<TemplateArtifact>("PUT", `gws/templates/${editingId}`, body);
        setRows((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      } else {
        const created = await apiSend<TemplateArtifact>("POST", "gws/templates", body);
        setRows((prev) => [created, ...prev]);
      }
      setEditorOpen(false);
    } catch (e) {
      setEditorError(e instanceof ApiError ? e.message : "Failed to save template.");
    } finally {
      setSubmitting(false);
    }
  }, [draft, editingId]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiSend<{ ok: boolean }>("DELETE", `gws/templates/${deleteTarget.id}`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete template.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  return (
    <Card className="bg-card ring-1 ring-border/40">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>Template Artifacts</CardTitle>
          <CardDescription>
            Reusable Google Drive templates (docs, sheets, slides, forms) agents can reference by id.
          </CardDescription>
        </div>
        <Button onClick={openCreate} size="sm">
          <PlusIcon className="size-3.5" />
          Add template
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/20 py-12 text-center">
            <p className="text-sm text-muted-foreground">No templates registered yet.</p>
            <Button onClick={openCreate} size="sm" variant="outline">
              <PlusIcon className="size-3.5" />
              Add your first template
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border/40">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Drive</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id} className="border-border/30">
                  <TableCell className="font-medium">
                    {t.name}
                    {t.description ? (
                      <p className="text-xs font-normal text-muted-foreground">{t.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {t.templateType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <a
                      href={t.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                    >
                      {t.driveId}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(t.tags ?? []).length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        (t.tags ?? []).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(t)}
                        title="Edit template"
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(t)}
                        title="Delete template"
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
            <DialogTitle>{editingId ? "Edit template" : "Add template"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update this template's metadata and Drive location."
                : "Register a reusable Drive file for agents to reference."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Weekly status report"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-description">Description</Label>
              <Input
                id="tpl-description"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-type">Type</Label>
              <Select
                value={draft.templateType}
                onValueChange={(v) => setDraft((d) => ({ ...d, templateType: v as TemplateType }))}
              >
                <SelectTrigger id="tpl-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-drive-id">Drive file id</Label>
              <Input
                id="tpl-drive-id"
                value={draft.driveId}
                onChange={(e) => setDraft((d) => ({ ...d, driveId: e.target.value }))}
                placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz"
                spellCheck={false}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-drive-url">Drive URL</Label>
              <Input
                id="tpl-drive-url"
                value={draft.driveUrl}
                onChange={(e) => setDraft((d) => ({ ...d, driveUrl: e.target.value }))}
                placeholder="https://docs.google.com/document/d/..."
                spellCheck={false}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-tags">Tags</Label>
              <Input
                id="tpl-tags"
                value={draft.tags}
                onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
                placeholder="reporting, weekly"
              />
              <p className="text-xs text-muted-foreground">Comma-separated.</p>
            </div>
            {editorError ? <p className="text-sm text-destructive">{editorError}</p> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={submitDraft}
              disabled={
                submitting || !draft.name.trim() || !draft.driveId.trim() || !draft.driveUrl.trim()
              }
            >
              {submitting ? "Saving…" : editingId ? "Save changes" : "Create template"}
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
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span> from the
              registry. Agents referencing it will no longer find it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
