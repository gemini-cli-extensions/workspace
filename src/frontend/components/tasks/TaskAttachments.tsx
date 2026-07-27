/**
 * @fileoverview TaskAttachments — the real Attachments list for the task
 * viewport, backed by `GET/POST/GET-stream/DELETE
 * /api/tasks/{id}/attachments`.
 *
 * Each row shows a file-type icon, filename, human-readable size, and ghost
 * view/download/delete icon buttons. View + download both hit the streaming GET
 * route (`/api/tasks/{id}/attachments/{attId}`) — view opens it in a new tab,
 * download forces a `download` attribute. Uploads go through a hidden file input
 * that POSTs multipart form-data; the returned metadata row is appended. Bytes
 * live in R2; this component only ever sees metadata.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DownloadIcon,
  EyeIcon,
  FileArchiveIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FileType2Icon,
  ImageIcon,
  Trash2Icon,
  UploadCloudIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { apiGet, apiSend, ApiError } from "@/lib/api";
import { humanSize } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ErrorState } from "./Shared";
import type { TaskAttachment } from "./types";

export interface TaskAttachmentsProps {
  taskId: string;
}

/** Pick a lucide icon component for an attachment based on its MIME / name. */
function iconFor(att: TaskAttachment) {
  const type = att.contentType ?? "";
  const name = att.filename.toLowerCase();
  if (type.startsWith("image/")) return FileImageIcon;
  if (type.startsWith("text/") || type === "application/json" || name.endsWith(".md")) {
    return FileTextIcon;
  }
  if (/\.(zip|tar|gz|rar|7z)$/.test(name) || type.includes("zip")) return FileArchiveIcon;
  if (type === "application/pdf" || name.endsWith(".pdf")) return FileTextIcon;
  return FileIcon;
}

/**
 * A small stack of three overlapping, rotated icon cards used as the visual
 * anchor of the empty-state dropzone. Purely decorative.
 */
function PreviewStack() {
  return (
    <div className="relative mb-4 h-14 w-16" aria-hidden="true">
      <div className="absolute left-1 top-1 flex size-12 -rotate-12 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/40">
        <FileType2Icon className="size-5 text-muted-foreground/70" />
      </div>
      <div className="absolute right-1 top-1 flex size-12 rotate-12 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border/40">
        <ImageIcon className="size-5 text-muted-foreground/70" />
      </div>
      <div className="absolute left-2 top-0 flex size-12 items-center justify-center rounded-lg bg-card ring-1 ring-border/60">
        <FileTextIcon className="size-5 text-foreground/80" />
      </div>
    </div>
  );
}

interface NoFilesDropzoneProps {
  /** A file has been chosen (via input, drop, or paste) but not yet uploaded. */
  selected: File | null;
  /** True while an upload request is in flight. */
  uploading: boolean;
  /** Open the native file picker. */
  onBrowse: () => void;
  /** A file was picked via drag-and-drop or clipboard paste. */
  onPick: (file: File) => void;
  /** Clear the currently-selected file. */
  onClear: () => void;
}

/**
 * Polished empty state shown when a task has no attachments: a dashed rounded
 * drop zone that accepts drag-and-drop, click-to-browse, and clipboard paste.
 * All three routes funnel into {@link NoFilesDropzoneProps.onPick}, which the
 * parent wires to the real R2 multipart upload.
 */
function NoFilesDropzone({
  selected,
  uploading,
  onBrowse,
  onPick,
  onClear,
}: NoFilesDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);

  // Clipboard paste (⌘V) while the dropzone is on screen picks the first file.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = e.clipboardData?.files?.[0];
      if (file) {
        e.preventDefault();
        onPick(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onPick]);

  const ready = selected != null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onPick(file);
      }}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed",
        "border-border/50 px-6 py-10 text-center transition-colors",
        "hover:border-primary/50 hover:bg-primary/5",
        dragOver && "border-primary bg-primary/10",
        ready && !dragOver && "border-primary/60 bg-primary/5",
      )}
    >
      <PreviewStack />

      <p className="text-sm font-medium text-foreground">
        {ready ? "Ready to upload" : "Drop files to upload"}
      </p>

      {ready ? (
        <p className="mt-1 max-w-xs truncate text-xs text-muted-foreground">
          {selected.name}
          {selected.size ? ` · ${humanSize(selected.size)}` : ""}
        </p>
      ) : (
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          PNG, JPG, PDF up to 25&nbsp;MB. Or paste from clipboard with{" "}
          <Kbd>⌘</Kbd>
          <Kbd>V</Kbd>.
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" disabled={uploading} onClick={onBrowse}>
          <UploadCloudIcon className="size-4" />
          {uploading ? "Uploading…" : ready ? "Upload file" : "Choose files"}
        </Button>
        {ready ? (
          <Button size="sm" variant="ghost" disabled={uploading} onClick={onClear}>
            <XIcon className="size-4" />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Attachments list + uploader card for a single task. */
export function TaskAttachments({ taskId }: TaskAttachmentsProps) {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ data: TaskAttachment[] }>(`tasks/${taskId}/attachments`);
      setAttachments(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load attachments.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        // Multipart upload — bypass the JSON apiSend helper and post FormData
        // directly so the browser sets the multipart boundary.
        const res = await fetch(`/api/tasks/${taskId}/attachments`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const text = await res.text();
          let message = `Upload failed (${res.status})`;
          try {
            const parsed = text ? JSON.parse(text) : null;
            if (parsed && typeof parsed === "object" && "error" in parsed) {
              message = String((parsed as { error: unknown }).error);
            }
          } catch {
            /* keep default message */
          }
          throw new ApiError(res.status, message);
        }
        const created = (await res.json()) as TaskAttachment;
        setAttachments((prev) => [...prev, created]);
        setSelected(null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to upload file.");
      } finally {
        setUploading(false);
      }
    },
    [taskId],
  );

  const remove = useCallback(
    async (att: TaskAttachment) => {
      const prev = attachments;
      setAttachments(attachments.filter((a) => a.id !== att.id));
      try {
        await apiSend<{ ok: boolean }>("DELETE", `tasks/${taskId}/attachments/${att.id}`);
      } catch (e) {
        setAttachments(prev);
        setError(e instanceof ApiError ? e.message : "Failed to delete attachment.");
      }
    },
    [attachments, taskId],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">
            Attachments
            {attachments.length > 0 ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {attachments.length}
              </span>
            ) : null}
          </CardTitle>
          <input
            ref={inputRef}
            type="file"
            aria-label="Upload attachment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                // In the empty state we stage the file so the dropzone can show
                // its "Ready to upload" confirmation; the "Add" button (list
                // present) uploads immediately.
                if (attachments.length === 0) setSelected(file);
                else void upload(file);
              }
              e.target.value = "";
            }}
          />
          {attachments.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon className="size-4" />
              {uploading ? "Uploading…" : "Add"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error ? <ErrorState message={error} onRetry={load} /> : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading attachments…</p>
        ) : attachments.length === 0 ? (
          <NoFilesDropzone
            selected={selected}
            uploading={uploading}
            onBrowse={() => {
              // When a file is already staged, the primary button uploads it;
              // otherwise it opens the native picker.
              if (selected) void upload(selected);
              else inputRef.current?.click();
            }}
            onPick={(file) => setSelected(file)}
            onClear={() => setSelected(null)}
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {attachments.map((att) => {
              const Icon = iconFor(att);
              const href = `/api/tasks/${taskId}/attachments/${att.id}`;
              return (
                <li
                  key={att.id}
                  className="group/att flex items-center gap-3 rounded-md border border-border/40 px-3 py-2"
                >
                  <Icon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{att.filename}</span>
                    {att.size != null ? (
                      <span className="text-xs text-muted-foreground">{humanSize(att.size)}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      render={
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View ${att.filename}`}
                        />
                      }
                    >
                      <EyeIcon className="size-4" />
                      <span className="sr-only">View {att.filename}</span>
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      render={
                        <a
                          href={href}
                          download={att.filename}
                          aria-label={`Download ${att.filename}`}
                        />
                      }
                    >
                      <DownloadIcon className="size-4" />
                      <span className="sr-only">Download {att.filename}</span>
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${att.filename}`}
                      onClick={() => void remove(att)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
