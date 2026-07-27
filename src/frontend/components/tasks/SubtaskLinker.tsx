/**
 * @fileoverview SubtaskLinker — the "add existing subtask" control for the task
 * viewport's Subtasks card. It links an existing task as a child of the current
 * task via the parent-child backend (migration 0004):
 *
 *   Typeahead   → as the user types, debounce-search `GET /api/tasks?q=<text>`
 *                 and render matches in a dropdown. Selecting a match links it:
 *                 `PATCH /api/tasks/{matchId}` with `{ parentId: currentId }`.
 *   Id paste    → if the raw input looks like a task id (UUID) and the user
 *                 submits (Enter / the link button), link that id directly with
 *                 the same PATCH — no search round-trip required.
 *   Cycle guard → the current task, its existing children, and its ancestors are
 *                 excluded from the suggestion list to avoid obvious cycles; the
 *                 backend still validates and returns a 400 `{error}` on
 *                 self/cycle/missing, which we surface inline.
 *
 * On a successful link we call `onLinked()` so the parent card refetches its
 * children. All errors flow to `onError(message)` (no alert()).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LinkIcon, Loader2Icon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend, ApiError } from "@/lib/api";

import { PriorityBadge } from "./PriorityBadge";
import { TaskStatusBadge } from "./StatusBadge";
import type { ListEnvelope, Task } from "./types";

/** RFC-4122-ish UUID shape used by the backend ids. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Does this raw input look like a task id we can link directly? */
function looksLikeId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export interface SubtaskLinkerProps {
  /** The current (parent) task id children are linked under. */
  taskId: string;
  /** Ids to exclude from suggestions: self + existing children + ancestors. */
  excludeIds: Set<string>;
  /** Called after a successful link so the parent can refetch children. */
  onLinked: () => void;
  /** Surface a link error inline in the parent card. */
  onError: (message: string) => void;
}

/** Debounced typeahead + id-paste control to link an existing task as a child. */
export function SubtaskLinker({ taskId, excludeIds, onLinked, onError }: SubtaskLinkerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Task[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search against `GET /api/tasks?q=`. An id-shaped query skips the
  // search entirely (there's a dedicated submit path for it).
  useEffect(() => {
    const text = query.trim();
    if (!text || looksLikeId(text)) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await apiGet<ListEnvelope<Task>>("tasks", { q: text, limit: 8 });
        const filtered = res.data.filter((t) => !excludeIds.has(t.id));
        setResults(filtered);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, excludeIds]);

  /** Link a task id as a child of the current task. */
  const link = useCallback(
    async (childId: string) => {
      const id = childId.trim();
      if (!id || linking) return;
      if (id === taskId) {
        onError("A task cannot be its own subtask.");
        return;
      }
      setLinking(true);
      onError("");
      try {
        await apiSend<Task>("PATCH", `tasks/${id}`, { parentId: taskId });
        setQuery("");
        setResults([]);
        setOpen(false);
        onLinked();
      } catch (e) {
        onError(e instanceof ApiError ? e.message : "Failed to link subtask.");
      } finally {
        setLinking(false);
      }
    },
    [linking, onError, onLinked, taskId],
  );

  /** Enter / link-button submit: link a pasted id directly, else the top match. */
  const submit = useCallback(() => {
    const text = query.trim();
    if (!text) return;
    if (looksLikeId(text)) {
      void link(text);
      return;
    }
    if (results.length > 0) void link(results[0]!.id);
  }, [link, query, results]);

  const idMode = looksLikeId(query);

  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onBlur={() => {
              // Delay so a click on a suggestion registers before we close.
              blurTimer.current = setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Add existing subtask by id or name"
            aria-label="Add existing subtask by id or name"
            className="h-9 pl-8"
          />
          {searching ? (
            <Loader2Icon className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={linking || !query.trim() || (!idMode && results.length === 0)}
          onClick={submit}
        >
          <LinkIcon className="size-4" />
          Link
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Search by name, or paste a task id to link it directly.
      </p>

      {/* Typeahead dropdown. Positioned over the following content; uses ring
          separation (no 1px borders) per the Monolith rules. */}
      {open && !idMode && results.length > 0 ? (
        <ul className="absolute left-0 right-0 top-[3.25rem] z-20 max-h-64 overflow-y-auto rounded-md bg-popover p-1 shadow-lg ring-1 ring-border/40">
          {results.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                disabled={linking}
                // Cancel the input's blur-close so this click can land.
                onMouseDown={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                }}
                onClick={() => void link(t.id)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted/50 disabled:opacity-60"
              >
                <TaskStatusBadge status={t.status} className="shrink-0" />
                <PriorityBadge priority={t.priority} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
