/**
 * @fileoverview TaskComments — the real Comments thread for the task viewport,
 * backed by `GET/POST /api/tasks/{id}/comments`.
 *
 * Renders each comment as an avatar-initials + name + relative-time header over
 * a muted bubble body, oldest→newest. Each body is stored as **sanitized HTML**
 * and rendered via {@link TaskRichHtml}. Below the thread sits a {@link
 * TaskRichEditor} composer with a submit / ⌘↵ affordance; posting optimistically
 * appends the new comment, then reconciles with the server row (or rolls back on
 * error). No data is fabricated — an empty thread shows an honest empty state.
 *
 * The Plate composer is browser-only, so it is gated behind a `mounted` flag
 * (rendering a placeholder shell during SSR / first hydration paint) and mounted
 * inside the existing `client:load` task island.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { apiGet, apiSend, ApiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";

import { ErrorState } from "./Shared";
import { TaskRichEditor } from "./TaskRichEditor";
import { TaskRichHtml } from "./TaskRichHtml";
import { htmlToPlainText } from "./task-html";
import { initials, type TaskComment } from "./types";

export interface TaskCommentsProps {
  taskId: string;
}

/** Comments thread + composer for a single task. */
export function TaskComments({ taskId }: TaskCommentsProps) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Bumped after each successful post to remount (and clear) the Plate composer,
  // since the editor seeds its value once on mount.
  const [composerKey, setComposerKey] = useState(0);

  // The Plate composer is browser-only; gate it behind a mounted flag so it never
  // renders during SSR / first hydration paint on this `client:load` island.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ data: TaskComment[] }>(`tasks/${taskId}/comments`);
      setComments(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load comments.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  // `draft` holds sanitized HTML from the editor; treat it as empty when it has
  // no visible text (an empty document still serializes to a stray `<p></p>`).
  const draftEmpty = !htmlToPlainText(draft).trim();

  const send = useCallback(async () => {
    const body = draft;
    if (draftEmpty || sending) return;
    setSending(true);
    setError(null);

    // Optimistic append with a temporary id, reconciled on success.
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: TaskComment = {
      id: tempId,
      taskId,
      author: "You",
      body,
      createdAt: Date.now(),
    };
    setComments((prev) => [...prev, optimistic]);
    setDraft("");
    // Remount the composer so it clears back to an empty document.
    setComposerKey((k) => k + 1);

    try {
      const saved = await apiSend<TaskComment>("POST", `tasks/${taskId}/comments`, { body });
      setComments((prev) => prev.map((c) => (c.id === tempId ? saved : c)));
    } catch (e) {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      setDraft(body);
      setError(e instanceof ApiError ? e.message : "Failed to post comment.");
    } finally {
      setSending(false);
    }
  }, [draft, draftEmpty, sending, taskId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Comments
          {comments.length > 0 ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">{comments.length}</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <ErrorState message={error} onRetry={load} /> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading comments…</p>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/20 px-4 py-8 text-center">
            <MessageSquareIcon className="size-6 text-muted-foreground" />
            <p className="max-w-xs text-xs text-muted-foreground">
              No comments yet. Start the discussion below.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {comments.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <Avatar size="sm" className="mt-0.5">
                  <AvatarFallback>{initials(comment.author)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{comment.author}</span>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(comment.createdAt)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <TaskRichHtml stored={comment.body} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Composer — Plate rich-text editor + submit / ⌘↵ footer. Gated behind
            `mounted` so the browser-only editor never renders during SSR. */}
        {mounted ? (
          <div
            className="flex flex-col overflow-hidden rounded-lg bg-input/30 ring-1 ring-border/40 focus-within:ring-2 focus-within:ring-ring/50"
            onKeyDownCapture={(e) => {
              // ⌘/Ctrl+Enter submits, mirroring the old composer affordance.
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (!sending && !draftEmpty) void send();
              }
            }}
          >
            <TaskRichEditor
              key={composerKey}
              valueHtml=""
              onChangeHtml={setDraft}
              placeholder="Write a comment…"
              className="rounded-none bg-transparent ring-0 focus-within:ring-0"
              contentClassName="min-h-20"
            />
            <div className="flex items-center justify-between gap-2 bg-muted/10 px-2 py-1.5">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                <Kbd>⌘</Kbd>
                <Kbd>↵</Kbd>
                <span>send</span>
              </span>
              <Button
                type="button"
                size="sm"
                onClick={() => void send()}
                disabled={sending || draftEmpty}
              >
                {sending ? "Comment…" : "Comment"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="min-h-28 rounded-lg bg-input/30 ring-1 ring-border/40" />
        )}
      </CardContent>
    </Card>
  );
}
