/**
 * @fileoverview TaskRichHtml — the read-only renderer for stored task rich text
 * (descriptions + comment bodies). Companion to {@link TaskRichEditor}.
 *
 * It takes any stored content string, NORMALIZES it to HTML (upgrading the three
 * legacy forms — HTML fragment, Round-2 Plate envelope, or plain text/markdown —
 * via `normalizeStoredToHtml`), SANITIZES it, and injects it through
 * `dangerouslySetInnerHTML` inside a dark-Monolith prose wrapper.
 *
 * SSR safety: `normalizeStoredToHtml` is a pure string→HTML transform, so this
 * component can render on the server. The sanitizer, however, prefers a real
 * DOM (DOMPurify). To stay safe AND avoid a hydration mismatch we:
 *   • before mount (SSR / first paint) → render the flattened PLAIN TEXT (via
 *     `htmlToPlainText`), which is inert and layout-stable, and
 *   • after mount → swap in the fully DOMPurify-sanitized HTML.
 * The `mounted` flag makes the server and first-client render agree (both show
 * plain text), then the client upgrades to rich HTML on the next commit.
 */

"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { sanitizeHtml } from "./sanitize-html";
import { htmlToPlainText, normalizeStoredToHtml } from "./task-html";

export interface TaskRichHtmlProps {
  /** Stored content string (HTML fragment, Plate envelope, or plain text). */
  stored: string | null | undefined;
  /** Extra classes for the prose wrapper. */
  className?: string;
}

/**
 * Shared dark-prose typography for injected task HTML. Mirrors the notes
 * PlateNodes styling (headings, lists, quote accent, code block) using utility
 * selectors so the stored HTML renders on-brand — no 1px borders.
 */
const PROSE_CLASSES = cn(
  "text-sm leading-7 text-foreground break-words",
  // Headings
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight",
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
  "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-tight",
  // Paragraphs
  "[&_p]:mb-2 [&_p:last-child]:mb-0",
  // Lists
  "[&_ul]:my-2 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:mb-1",
  // Blockquote — left accent via inset shadow, never a 1px border.
  "[&_blockquote]:my-3 [&_blockquote]:rounded-r-md [&_blockquote]:bg-muted/30 [&_blockquote]:py-1.5 [&_blockquote]:pr-3 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_blockquote]:shadow-[inset_2px_0_0_0_var(--color-border)]",
  // Code block + inline code
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted/60 [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:leading-6 [&_pre]:ring-1 [&_pre]:ring-border/40",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted/60 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]",
  // Links
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/40 [&_a]:underline-offset-2 hover:[&_a]:decoration-primary",
);

/** Read-only render of stored task rich text (HTML / envelope / plain text). */
export function TaskRichHtml({ stored, className }: TaskRichHtmlProps) {
  // Only inject sanitized HTML after mount (DOMPurify has a real DOM). Before
  // then, server and first client render both show inert plain text so there is
  // no hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const html = useMemo(() => sanitizeHtml(normalizeStoredToHtml(stored)), [stored]);
  const plain = useMemo(() => htmlToPlainText(stored), [stored]);

  if (!mounted) {
    return (
      <div className={cn("text-sm leading-7 whitespace-pre-wrap text-foreground", className)}>
        {plain}
      </div>
    );
  }

  return (
    <div
      className={cn(PROSE_CLASSES, className)}
      // Content is normalized + DOMPurify-sanitized to the task allow-list.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default TaskRichHtml;
