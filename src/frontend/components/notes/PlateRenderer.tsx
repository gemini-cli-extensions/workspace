/**
 * @fileoverview PlateRenderer — a lightweight, read-only render of a saved note
 * `body`. Used by the notes list cards so we get faithful rich-text output
 * (headings, lists, quotes, code, links) without mounting the full editor.
 *
 * Like the editor, Plate touches browser-only APIs, so any host page must mount
 * this with `client:only="react"`. The notes list island is already a client
 * island, so importing it there is fine.
 *
 * `lineClamp` truncates the rendered output for card previews; pass `false` for
 * a full read view. Legacy plain-text bodies are handled by `bodyToPlateValue`,
 * which lifts them into paragraphs — so old notes render as clean prose.
 */

import { useMemo } from "react";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";

import { cn } from "@/lib/utils";

import { notesPlugins } from "./plate-plugins";
import { bodyToPlateValue, type PlateValue } from "./plate-value";

export interface PlateRendererProps {
  /** Stored `body` string (rich-text envelope or legacy plain text). */
  body: string;
  /** Clamp the preview to N lines (default 4). Pass `false` to disable. */
  lineClamp?: number | false;
  className?: string;
}

const CLAMP_CLASS: Record<number, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
};

/** Read-only Plate render of a note body. */
export function PlateRenderer({ body, lineClamp = 4, className }: PlateRendererProps) {
  const value = useMemo<PlateValue>(() => bodyToPlateValue(body), [body]);

  const editor = usePlateEditor({
    plugins: notesPlugins,
    value,
  });

  const clamp = typeof lineClamp === "number" ? CLAMP_CLASS[lineClamp] : undefined;

  return (
    <div className={cn("text-sm text-muted-foreground", clamp, className)}>
      <Plate editor={editor} readOnly>
        <PlateContent readOnly className="outline-none [&_*]:cursor-default" />
      </Plate>
    </div>
  );
}

export default PlateRenderer;
