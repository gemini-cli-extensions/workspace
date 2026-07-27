/**
 * @fileoverview TaskRichEditor — the editable PlateJS rich-text island shared by
 * the task DESCRIPTION (intake dialog + viewport) and task COMMENTS.
 *
 * Unlike the notes editor (which persists a Plate ENVELOPE JSON), this editor
 * bridges to a stored HTML string: it DESERIALIZES the incoming value into a
 * Plate value on load, and on every change SERIALIZES the Plate value back to
 * **sanitized HTML** via `onChangeHtml`, so `tasks.description` /
 * `task_comments.body` hold render-ready HTML with no schema change.
 *
 * On load it handles the three legacy storage forms transparently:
 *   (a) an HTML fragment (Round 3+)        → `deserializeHtml` into Plate.
 *   (b) a Plate envelope `{v,format,value}` → use the envelope's value directly.
 *   (c) plain text / markdown (Round 1)     → paragraph(s).
 *
 * The plugin stack + toolbar are REUSED from the notes feature so the mark /
 * heading / list / link capability surface is identical everywhere.
 *
 * SSR: PlateJS + `deserializeHtml` touch browser-only DOM APIs. The host mounts
 * this inside a `client:load` island, and callers additionally gate it behind a
 * `mounted` flag (rendering a placeholder until then) so it never runs during
 * Astro SSR / first hydration paint (avoiding React #418/#425).
 */

"use client";

import { useCallback, useMemo } from "react";
import { createSlateEditor, deserializeHtml } from "platejs";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";

// Pull the plugin stack + toolbar directly from the notes files (neither is
// re-exported from the notes barrel) so both rich-text surfaces share the exact
// same mark / heading / list / link capability set.
import { notesPlugins } from "@/components/notes/plate-plugins";
import { PlateToolbar as TaskRichToolbar } from "@/components/notes/PlateToolbar";
import { cn } from "@/lib/utils";

import { sanitizeHtml } from "./sanitize-html";
import {
  emptyPlateValue,
  plateValueToHtml,
  type PlateElement,
  type PlateNode,
  type PlateValue,
} from "./task-html";

export interface TaskRichEditorProps {
  /** The currently stored content string (HTML, Plate envelope, or plain text). */
  valueHtml: string;
  /** Called with a fresh SANITIZED HTML string on every edit. */
  onChangeHtml: (html: string) => void;
  /** Accessible label / placeholder for the empty editor. */
  placeholder?: string;
  /** Optional id for label association. */
  id?: string;
  /** Extra classes for the outer editor shell. */
  className?: string;
  /** Extra classes for the editable content area (e.g. min-height overrides). */
  contentClassName?: string;
}

/** Round-2 envelope shape (only what we read). */
interface EnvelopeLike {
  v?: number;
  format?: string;
  value?: PlateValue;
}

/**
 * Deserialize a stored content string into a Plate value for editing.
 *
 * For the HTML case it uses a HEADLESS Slate editor (built from the same plugin
 * stack) to run `deserializeHtml`, so headings/lists/links/marks round-trip
 * through the exact registry that serialized them — without depending on the
 * live React editor instance. Envelope + plain-text cases are decoded without a
 * DOM.
 */
function storedToPlateValue(stored: string): PlateValue {
  const raw = stored ?? "";
  if (!raw.trim()) return emptyPlateValue();

  // (b) Round-2 Plate envelope → use its value directly.
  if (raw.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as EnvelopeLike;
      if (parsed.format === "plate" && parsed.v === 1 && Array.isArray(parsed.value) && parsed.value.length > 0) {
        return parsed.value;
      }
    } catch {
      /* not an envelope — fall through */
    }
  }

  // (a) HTML fragment → deserialize through the plugin rules.
  const isHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
  if (isHtml) {
    try {
      const headless = createSlateEditor({ plugins: notesPlugins });
      const fragment = deserializeHtml(headless, { element: raw }) as unknown as PlateNode[];
      if (Array.isArray(fragment) && fragment.length > 0) {
        // deserializeHtml can return bare text leaves at the top level; wrap any
        // stragglers so every top-level node is a block element.
        const blocks = fragment.map((node) =>
          node && typeof node === "object" && "children" in node
            ? (node as PlateElement)
            : ({ type: "p", children: [{ text: String((node as { text?: string })?.text ?? "") }] } as PlateElement),
        );
        if (blocks.length > 0) return blocks;
      }
    } catch {
      /* fall through to plain-text handling */
    }
  }

  // (c) plain text / markdown → paragraphs (blank lines split blocks).
  const paragraphs = raw.split(/\n{2,}/);
  return paragraphs.map((para) => ({
    type: "p",
    children: [{ text: para.replace(/\n+/g, " ") }],
  })) as PlateValue;
}

/**
 * Editable Plate surface that reads/writes a stored content string as HTML.
 * The editor is seeded once from `valueHtml`; hosts remount it (e.g. by keying
 * the dialog) when they need to re-seed for a different task/comment.
 */
export function TaskRichEditor({
  valueHtml,
  onChangeHtml,
  placeholder = "Write…",
  id,
  className,
  contentClassName,
}: TaskRichEditorProps) {
  // Compute the initial Plate value once from the incoming stored string
  // (handles the HTML / envelope / plain-text forms). `usePlateEditor` memoizes
  // the editor, so this seeds it exactly once; hosts remount to re-seed.
  const initialValue = useMemo<PlateValue>(
    () => storedToPlateValue(valueHtml),
    // Seed once on mount; hosts key the component to force a re-seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = usePlateEditor({
    plugins: notesPlugins,
    value: initialValue,
  });

  const handleChange = useCallback(
    ({ value }: { value: unknown }) => {
      const html = plateValueToHtml(value as PlateValue);
      onChangeHtml(sanitizeHtml(html));
    },
    [onChangeHtml],
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md bg-input/30 ring-1 ring-border/40 focus-within:ring-2 focus-within:ring-ring/50",
        className,
      )}
    >
      <Plate editor={editor} onChange={handleChange}>
        {/* Reuse the notes toolbar so the capability surface is identical. */}
        <TaskRichToolbar />
        <PlateContent
          id={id}
          placeholder={placeholder}
          aria-label={placeholder}
          spellCheck
          className={cn(
            "max-h-[22rem] min-h-32 overflow-y-auto px-3 py-2.5 text-sm leading-7 text-foreground outline-none",
            "[&_[data-slate-placeholder]]:text-muted-foreground [&_[data-slate-placeholder]]:opacity-100",
            contentClassName,
          )}
        />
      </Plate>
    </div>
  );
}

export default TaskRichEditor;
