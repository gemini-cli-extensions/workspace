/**
 * @fileoverview ProjectDialog — create/edit project form. POSTs `/api/projects`
 * or PATCHes `/api/projects/{id}`. A slug is auto-derived from the name unless
 * the user overrides it. Surfaced via a `trigger` render element so the host
 * page can use any button styling.
 */

import { useEffect, useState, type ReactElement } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiSend, ApiError } from "@/lib/api";

import { ErrorState } from "./Shared";
import {
  PROJECT_STATUS_LABELS,
  type Project,
  type ProjectStatus,
} from "./types";

const STATUSES: ProjectStatus[] = ["active", "on_hold", "archived"];

/** Six accent presets matching the Monolith chart palette family. */
const COLOR_PRESETS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#a855f7"];

/** Lowercase, hyphenate, strip non-url-safe chars to build a slug. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface ProjectDialogProps {
  trigger: ReactElement;
  project?: Project;
  onSaved: (project: Project) => void;
}

export function ProjectDialog({ trigger, project, onSaved }: ProjectDialogProps) {
  const editing = Boolean(project);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [owner, setOwner] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0]!);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(project?.name ?? "");
    setSlug(project?.slug ?? "");
    setSlugTouched(Boolean(project));
    setDescription(project?.description ?? "");
    setStatus(project?.status ?? "active");
    setOwner(project?.owner ?? "");
    setColor(project?.color ?? COLOR_PRESETS[0]!);
  }, [open, project]);

  // Auto-derive the slug from the name until the user edits it directly.
  function handleNameChange(next: string) {
    setName(next);
    if (!slugTouched) setSlug(slugify(next));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const finalSlug = slug.trim() || slugify(name);
    if (!finalSlug) {
      setError("A URL-safe slug could not be derived. Enter one manually.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      slug: finalSlug,
      description: description.trim() || null,
      status,
      owner: owner.trim() || "you",
      color,
    };
    try {
      const saved = editing
        ? await apiSend<Project>("PATCH", `projects/${project!.id}`, body)
        : await apiSend<Project>("POST", "projects", body);
      onSaved(saved);
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this project's details."
              : "Group tasks and notes under a named project."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Marketing Site Refresh"
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="project-slug">Slug</Label>
            <Input
              id="project-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              placeholder="marketing-site-refresh"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="project-desc">Description</Label>
            <Textarea
              id="project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary of the project's goal."
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PROJECT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="project-owner">Owner</Label>
              <Input
                id="project-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="you"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Accent color</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use accent ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={
                    "size-7 rounded-full ring-offset-2 ring-offset-background transition " +
                    (color === c ? "ring-2 ring-ring" : "ring-1 ring-border/40")
                  }
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {error ? <ErrorState message={error} /> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
