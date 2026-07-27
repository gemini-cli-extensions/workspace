/**
 * @fileoverview TeamNotes — the `/notes` island (hextaui "team-notes"). Loads
 * `GET /api/team-notes` with debounced search (`q`), a pinned filter, and a
 * project filter. Notes are created/edited via NoteDialog and can be pinned
 * (`PATCH /api/team-notes/{id}`) or deleted (AlertDialog → DELETE).
 *
 * The server already orders pinned notes first; we keep that ordering and show
 * a pin glyph + edit/delete controls per card.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PinIcon, PlusIcon, SearchIcon, PencilIcon, Trash2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { PlateRenderer } from "@/components/notes";

import { EmptyState, ErrorState } from "./Shared";
import { FilterSelect } from "./FilterSelect";
import { NoteDialog } from "./NoteDialog";
import { useProjects } from "./useProjects";
import type { ListEnvelope, TeamNote } from "./types";

const PINNED_OPTIONS = [
  { value: "true", label: "Pinned only" },
  { value: "false", label: "Unpinned" },
];

export function TeamNotes() {
  const { options: projectOptions, nameById } = useProjects();

  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [pinned, setPinned] = useState<string | undefined>();
  const [projectId, setProjectId] = useState<string | undefined>();
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ListEnvelope<TeamNote>>("team-notes", {
        q: debouncedQ || undefined,
        pinned,
        projectId,
        limit: 100,
      });
      if (id !== reqId.current) return;
      setNotes(res.data);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : "Failed to load notes.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [debouncedQ, pinned, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePin = useCallback(async (note: TeamNote) => {
    setPendingId(note.id);
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, pinned: !n.pinned } : n)));
    try {
      const updated = await apiSend<TeamNote>("PATCH", `team-notes/${note.id}`, {
        pinned: !note.pinned,
      });
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    } catch (e) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, pinned: note.pinned } : n)));
      setError(e instanceof ApiError ? e.message : "Failed to update pin.");
    } finally {
      setPendingId(null);
    }
  }, []);

  const handleDelete = useCallback(async (note: TeamNote) => {
    try {
      await apiSend<{ ok: boolean }>("DELETE", `team-notes/${note.id}`);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete note.");
    }
  }, []);

  const handleSaved = useCallback((saved: TeamNote) => {
    setNotes((prev) => {
      const exists = prev.some((n) => n.id === saved.id);
      return exists ? prev.map((n) => (n.id === saved.id ? saved : n)) : [saved, ...prev];
    });
  }, []);

  const hasFilters = Boolean(debouncedQ || pinned || projectId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search notes…"
              className="pl-8"
              aria-label="Search notes"
            />
          </div>
          <NoteDialog
            onSaved={handleSaved}
            trigger={
              <Button>
                <PlusIcon className="size-4" />
                New note
              </Button>
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={pinned}
            onChange={setPinned}
            options={PINNED_OPTIONS}
            allLabel="All notes"
            aria-label="Filter by pinned"
          />
          <FilterSelect
            value={projectId}
            onChange={setProjectId}
            options={projectOptions}
            allLabel="All projects"
            aria-label="Filter by project"
          />
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<PinIcon />}
          title={hasFilters ? "No notes match your filters" : "No notes yet"}
          description={
            hasFilters
              ? "Clear the search or filters to see more notes."
              : "Capture your first shared note for the team."
          }
          action={
            <NoteDialog
              onSaved={handleSaved}
              trigger={
                <Button variant="outline">
                  <PlusIcon className="size-4" />
                  New note
                </Button>
              }
            />
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {notes.map((note) => (
            <Card key={note.id} className={cn(note.pinned && "ring-amber-400/30")}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{note.title}</h2>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={note.pinned ? "Unpin note" : "Pin note"}
                      aria-pressed={note.pinned}
                      disabled={pendingId === note.id}
                      onClick={() => togglePin(note)}
                    >
                      <PinIcon
                        className={cn(
                          "size-4",
                          note.pinned ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                        )}
                      />
                    </Button>
                    <NoteDialog
                      note={note}
                      onSaved={handleSaved}
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label="Edit note">
                          <PencilIcon className="size-4" />
                        </Button>
                      }
                    />
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button size="icon-sm" variant="ghost" aria-label="Delete note">
                            <Trash2Icon className="size-4 text-muted-foreground" />
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                          <AlertDialogDescription>
                            “{note.title}” will be permanently removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => handleDelete(note)}
                          >
                            Delete note
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <PlateRenderer body={note.body} lineClamp={4} />

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">
                    {note.author}
                    {note.projectId ? ` · ${nameById.get(note.projectId) ?? "Project"}` : ""}
                  </span>
                  <span>{relativeTime(note.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
