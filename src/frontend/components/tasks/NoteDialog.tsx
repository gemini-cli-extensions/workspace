/**
 * @fileoverview NoteDialog — create/edit a team note. POSTs `/api/team-notes`
 * or PATCHes `/api/team-notes/{id}`. Supports an optional project association,
 * a pinned toggle, author, title, and a PlateJS rich-text body.
 *
 * The body is edited with the `PlateEditor` island and persisted as a string in
 * the existing `body` column: a JSON-encoded Plate envelope (see
 * `components/notes/plate-value`). Legacy plain-text bodies are loaded
 * transparently. We re-mount the editor per open via a `key` so each edit
 * session seeds from the correct note. Surfaced via a `trigger` element.
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiSend, ApiError } from "@/lib/api";
import { PlateEditor, bodyToSnippet } from "@/components/notes";

import { ErrorState } from "./Shared";
import { useProjects } from "./useProjects";
import type { TeamNote } from "./types";

export interface NoteDialogProps {
  trigger: ReactElement;
  note?: TeamNote;
  onSaved: (note: TeamNote) => void;
}

export function NoteDialog({ trigger, note, onSaved }: NoteDialogProps) {
  const editing = Boolean(note);
  const { options: projectOptions } = useProjects();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [projectId, setProjectId] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTitle(note?.title ?? "");
    setBody(note?.body ?? "");
    setAuthor(note?.author ?? "");
    setProjectId(note?.projectId ?? "");
    setPinned(note?.pinned ?? false);
  }, [open, note]);

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    // `body` holds the serialized Plate envelope; validate against its
    // extracted plain text so an empty rich-text document is still rejected.
    if (!bodyToSnippet(body).trim()) {
      setError("Body is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      body,
      author: author.trim() || "you",
      projectId: projectId || null,
      pinned,
    };
    try {
      const saved = editing
        ? await apiSend<TeamNote>("PATCH", `team-notes/${note!.id}`, payload)
        : await apiSend<TeamNote>("POST", "team-notes", payload);
      onSaved(saved);
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit note" : "New note"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update this team note." : "Capture a shared note for the team."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="note-title">Title</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note headline"
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="note-body">Body</Label>
            {/*
             * Re-mount the editor whenever the dialog opens or the target note
             * changes (`key`) so `PlateEditor` re-seeds from the correct body.
             * PlateJS is browser-only; the whole TeamNotes island is mounted
             * `client:only="react"`, so this never runs during SSR.
             */}
            <PlateEditor
              key={`${note?.id ?? "new"}:${open}`}
              id="note-body"
              value={body}
              onChange={setBody}
              placeholder="Write the note…"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="note-author">Author</Label>
              <Input
                id="note-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="you"
              />
            </div>

            <div className="grid gap-2">
              <Label>Project</Label>
              <Select
                value={projectId || "__none__"}
                onValueChange={(v) => setProjectId(v === "__none__" ? "" : String(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No project</SelectItem>
                  {projectOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Label className="flex items-center justify-between">
            <span>Pin to top</span>
            <Switch checked={pinned} onCheckedChange={(c) => setPinned(c)} />
          </Label>

          {error ? <ErrorState message={error} /> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
