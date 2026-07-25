/**
 * @fileoverview RichTextComposer — a Markdown composer with a formatting
 * toolbar, styled after the devl.dev "compose-rich" reference and adapted BY
 * HAND onto our base-ui + dark-Monolith stack (no Radix, no 1px borders).
 *
 * Layout:
 *   ┌───────────────────────────────────────────────┐
 *   │ [B] [I] [S] │ [</>] [🔗] │ [•]      Markdown    │  ← toolbar row
 *   ├───────────────────────────────────────────────┤
 *   │  <textarea>                                    │  ← body
 *   │                                                │
 *   ├───────────────────────────────────────────────┤
 *   │  ⌘↵ send                     [Cancel] [Submit] │  ← optional footer
 *   └───────────────────────────────────────────────┘
 *
 * The whole shell is a `focus-within:ring` card (ring-based separation, no 1px
 * borders). Each toolbar button wraps/inserts the correct Markdown around the
 * current textarea selection and restores the caret. Keyboard shortcuts mirror
 * the buttons: ⌘B bold, ⌘I italic, ⌘E code, ⌘K link. ⌘↵ submits (when an
 * `onSubmit` is provided).
 *
 * The value is a plain Markdown STRING — this component never parses or
 * serializes a document model, so it drops in anywhere a `<textarea>` did with
 * no schema/API change. Attach / mention / emoji are intentionally OUT of scope
 * (rendered as disabled affordances only when `showExtras` is set).
 *
 * SSR: no `window`/`document` access at module scope; all DOM work happens in
 * event handlers via a ref. Safe inside the existing `client:load` /
 * `client:visible` task islands.
 */

"use client";

import * as React from "react";
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  StrikethroughIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/** A single Markdown transform applied to the current textarea selection. */
type WrapKind =
  | { type: "wrap"; before: string; after: string; placeholder: string }
  | { type: "link"; placeholder: string }
  | { type: "line-prefix"; prefix: string; placeholder: string };

/**
 * Apply a Markdown transform to `value` over the `[start, end)` selection.
 * Returns the next value plus the caret/selection range to restore afterwards.
 */
function applyTransform(
  value: string,
  start: number,
  end: number,
  kind: WrapKind,
): { next: string; selStart: number; selEnd: number } {
  const selected = value.slice(start, end);

  if (kind.type === "wrap") {
    const text = selected || kind.placeholder;
    const next = value.slice(0, start) + kind.before + text + kind.after + value.slice(end);
    // If there was a selection, keep the inner text selected; otherwise select
    // the placeholder so the user can type over it.
    const innerStart = start + kind.before.length;
    return { next, selStart: innerStart, selEnd: innerStart + text.length };
  }

  if (kind.type === "link") {
    const text = selected || kind.placeholder;
    const snippet = `[${text}](url)`;
    const next = value.slice(0, start) + snippet + value.slice(end);
    // Select the `url` token so the user can immediately paste/type the href.
    const urlStart = start + `[${text}](`.length;
    return { next, selStart: urlStart, selEnd: urlStart + "url".length };
  }

  // line-prefix: prefix every line touched by the selection (or the caret line).
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const rawEnd = end > start ? end : start;
  const block = value.slice(lineStart, rawEnd) || kind.placeholder;
  const prefixed = block
    .split("\n")
    .map((line) => kind.prefix + line)
    .join("\n");
  const next = value.slice(0, lineStart) + prefixed + value.slice(rawEnd);
  return {
    next,
    selStart: lineStart,
    selEnd: lineStart + prefixed.length,
  };
}

/** One toolbar action: icon + accessible label + optional shortcut hint. */
interface ToolbarAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  kind: WrapKind;
  /** Rendered shortcut hint, e.g. ["⌘", "B"]. */
  shortcut?: string[];
}

const ACTIONS: ToolbarAction[] = [
  {
    id: "bold",
    label: "Bold",
    icon: BoldIcon,
    kind: { type: "wrap", before: "**", after: "**", placeholder: "bold text" },
    shortcut: ["⌘", "B"],
  },
  {
    id: "italic",
    label: "Italic",
    icon: ItalicIcon,
    kind: { type: "wrap", before: "*", after: "*", placeholder: "italic text" },
    shortcut: ["⌘", "I"],
  },
  {
    id: "strike",
    label: "Strikethrough",
    icon: StrikethroughIcon,
    kind: { type: "wrap", before: "~~", after: "~~", placeholder: "strikethrough" },
  },
  {
    id: "code",
    label: "Inline code",
    icon: CodeIcon,
    kind: { type: "wrap", before: "`", after: "`", placeholder: "code" },
    shortcut: ["⌘", "E"],
  },
  {
    id: "link",
    label: "Link",
    icon: LinkIcon,
    kind: { type: "link", placeholder: "text" },
    shortcut: ["⌘", "K"],
  },
  {
    id: "list",
    label: "Bulleted list",
    icon: ListIcon,
    kind: { type: "line-prefix", prefix: "- ", placeholder: "list item" },
  },
];

/** Props for {@link RichTextComposer}. */
export interface RichTextComposerProps {
  /** Controlled Markdown value. */
  value: string;
  /** Called with the next Markdown string on every edit. */
  onChange: (next: string) => void;
  /** Placeholder for the empty textarea. */
  placeholder?: string;
  /** Visible rows for the textarea (min height). Defaults to 4. */
  rows?: number;
  /** Disable all input (e.g. while saving). */
  disabled?: boolean;
  /** Autofocus the textarea on mount. */
  autoFocus?: boolean;
  /**
   * When provided, ⌘/Ctrl+Enter submits and a footer with a submit button is
   * shown. Omit for a bare toolbar+textarea (inline edit uses external buttons).
   */
  onSubmit?: () => void;
  /** Footer submit button label (e.g. "Comment"). Defaults to "Send". */
  submitLabel?: string;
  /** Busy state for the submit button (shows a "…" label + disables). */
  submitting?: boolean;
  /** When set, footer renders a Cancel button wired to this handler. */
  onCancel?: () => void;
  /** Disable the submit button beyond `submitting` (e.g. empty value). */
  submitDisabled?: boolean;
  /** Render disabled attach/mention/emoji affordances (out of scope, visual only). */
  showExtras?: boolean;
  /** Extra classes for the outer shell. */
  className?: string;
}

/**
 * A Markdown composer with a formatting toolbar and optional submit footer.
 *
 * @example Inline (external save buttons)
 * <RichTextComposer value={draft} onChange={setDraft} rows={5} autoFocus />
 *
 * @example Comment box (footer + ⌘↵)
 * <RichTextComposer
 *   value={draft}
 *   onChange={setDraft}
 *   onSubmit={send}
 *   submitLabel="Comment"
 *   submitting={sending}
 *   submitDisabled={!draft.trim()}
 *   placeholder="Write a comment…"
 * />
 */
export function RichTextComposer({
  value,
  onChange,
  placeholder = "Write in Markdown…",
  rows = 4,
  disabled = false,
  autoFocus = false,
  onSubmit,
  submitLabel = "Send",
  submitting = false,
  onCancel,
  submitDisabled = false,
  showExtras = false,
  className,
}: RichTextComposerProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  /** Run a toolbar transform against the live selection and restore the caret. */
  const runAction = React.useCallback(
    (kind: WrapKind) => {
      const el = textareaRef.current;
      if (!el || disabled) return;
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const { next, selStart, selEnd } = applyTransform(value, start, end, kind);
      onChange(next);
      // Restore focus + selection after React commits the new value.
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(selStart, selEnd);
      });
    },
    [value, onChange, disabled],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    if (e.key === "Enter" && onSubmit) {
      e.preventDefault();
      if (!submitting && !submitDisabled) onSubmit();
      return;
    }

    const key = e.key.toLowerCase();
    const shortcut: Record<string, WrapKind> = {
      b: { type: "wrap", before: "**", after: "**", placeholder: "bold text" },
      i: { type: "wrap", before: "*", after: "*", placeholder: "italic text" },
      e: { type: "wrap", before: "`", after: "`", placeholder: "code" },
      k: { type: "link", placeholder: "text" },
    };
    if (key in shortcut) {
      e.preventDefault();
      runAction(shortcut[key]!);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg bg-input/30 ring-1 ring-border/40",
        "transition-shadow focus-within:ring-2 focus-within:ring-ring/50",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* Toolbar row */}
      <div className="flex items-center gap-1 bg-muted/20 px-1.5 py-1">
        <div className="flex items-center gap-0.5">
          {ACTIONS.slice(0, 3).map((a) => (
            <ToolbarButton key={a.id} action={a} disabled={disabled} onRun={runAction} />
          ))}
        </div>
        <span aria-hidden className="mx-1 h-4 w-px bg-border/50" />
        <div className="flex items-center gap-0.5">
          {ACTIONS.slice(3, 5).map((a) => (
            <ToolbarButton key={a.id} action={a} disabled={disabled} onRun={runAction} />
          ))}
        </div>
        <span aria-hidden className="mx-1 h-4 w-px bg-border/50" />
        <div className="flex items-center gap-0.5">
          {ACTIONS.slice(5).map((a) => (
            <ToolbarButton key={a.id} action={a} disabled={disabled} onRun={runAction} />
          ))}
        </div>

        {showExtras ? (
          <span className="ml-1 text-[11px] text-muted-foreground/50">attach · mention</span>
        ) : null}

        <span className="ml-auto pr-1 text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase">
          Markdown
        </span>
      </div>

      {/* Body */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={rows}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={cn(
          "w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed",
          "text-foreground outline-none placeholder:text-muted-foreground",
          "disabled:cursor-not-allowed",
        )}
      />

      {/* Footer (only when submitting is wired) */}
      {onSubmit ? (
        <div className="flex items-center justify-between gap-2 bg-muted/10 px-2 py-1.5">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
            <span>send</span>
          </span>
          <div className="flex items-center gap-2">
            {onCancel ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={() => onSubmit()}
              disabled={submitting || submitDisabled}
            >
              {submitting ? `${submitLabel}…` : submitLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A single icon toolbar button with a hover shortcut hint. */
function ToolbarButton({
  action,
  disabled,
  onRun,
}: {
  action: ToolbarAction;
  disabled: boolean;
  onRun: (kind: WrapKind) => void;
}) {
  const Icon = action.icon;
  const title = action.shortcut
    ? `${action.label} (${action.shortcut.join("")})`
    : action.label;
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      disabled={disabled}
      // Prevent the textarea from losing its selection on mousedown so the
      // transform applies to the intended range.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onRun(action.kind)}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground",
        "transition-colors hover:bg-muted/60 hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

export default RichTextComposer;
