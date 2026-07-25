/**
 * @fileoverview PlateEditor — the editable rich-text island for a team note's
 * body. Mounted via `client:only="react"` (PlateJS / Slate rely on browser-only
 * DOM APIs and must never run during Astro SSR).
 *
 * The component is "controlled-ish": it seeds the editor from a stored `body`
 * string once, and pushes every change back out as a fresh `body` string via
 * `onChange`, so the parent dialog can persist exactly what it needs without
 * understanding the Plate value shape.
 *
 * Styling is Monolith-dark and prose-like: foreground text, muted placeholder,
 * ring-based separation (no 1px borders). The toolbar lives in `PlateToolbar`.
 */

import { useMemo } from "react";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";

import { cn } from "@/lib/utils";

import { notesPlugins } from "./plate-plugins";
import { PlateToolbar } from "./PlateToolbar";
import { bodyToPlateValue, plateValueToBody, type PlateValue } from "./plate-value";

export interface PlateEditorProps {
  /** The currently stored `body` string (rich-text envelope or legacy text). */
  value: string;
  /** Called with a fresh `body` string on every edit. */
  onChange: (body: string) => void;
  /** Accessible label / placeholder for the empty editor. */
  placeholder?: string;
  /** Optional id for label association. */
  id?: string;
  className?: string;
}

/**
 * The editable Plate surface. `usePlateEditor` memoizes the editor instance;
 * we seed it from `value` exactly once (the dialog remounts the editor when it
 * opens, which re-seeds it for the note being edited).
 */
export function PlateEditor({
  value,
  onChange,
  placeholder = "Write the note…",
  id,
  className,
}: PlateEditorProps) {
  const initialValue = useMemo<PlateValue>(() => bodyToPlateValue(value), [value]);

  const editor = usePlateEditor({
    plugins: notesPlugins,
    value: initialValue,
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md bg-input/30 ring-1 ring-border/40 focus-within:ring-2 focus-within:ring-ring/50",
        className,
      )}
    >
      <Plate
        editor={editor}
        onChange={({ value: next }) => onChange(plateValueToBody(next as PlateValue))}
      >
        <PlateToolbar />
        <PlateContent
          id={id}
          placeholder={placeholder}
          aria-label={placeholder}
          spellCheck
          className={cn(
            "max-h-[22rem] min-h-40 overflow-y-auto px-3 py-2.5 text-sm leading-7 text-foreground outline-none",
            // Muted placeholder (Plate renders it on the first empty block).
            "[&_[data-slate-placeholder]]:text-muted-foreground [&_[data-slate-placeholder]]:opacity-100",
          )}
        />
      </Plate>
    </div>
  );
}

export default PlateEditor;
