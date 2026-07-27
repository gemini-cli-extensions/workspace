/**
 * @fileoverview Markdown — a general-purpose renderer that turns an arbitrary
 * markdown STRING into dark-Monolith-styled, GitHub-flavoured output.
 *
 * WHY this exists separately from {@link file://./../assistant/MarkdownText.tsx}:
 * the assistant renderer is memoized on a single assistant text part and is
 * tuple to the streaming message pipeline. This one takes a plain `string`
 * prop, so it can render any stored content — task descriptions, comment
 * bodies, notes — through the same shared component map
 * ({@link file://./markdown-components.tsx}) for a consistent look.
 *
 * Fenced code blocks route through the Shiki-powered `CodeBlock`; inline code,
 * headings, lists, links, blockquotes and GFM tables are all styled for dark
 * mode.
 *
 * SSR: `CodeBlock` highlights inside a browser effect, so this component must
 * only ever be hydrated inside a client island (it already is — every task
 * page mounts the tasks islands with `client:load` / `client:visible`).
 */

"use client";

import { memo } from "react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { markdownComponents } from "@/components/ui/markdown-components";
import { cn } from "@/lib/utils";

/** Props for {@link Markdown}. */
export interface MarkdownProps {
  /** The raw markdown source string to render. */
  children: string;
  /** Optional wrapper classes (e.g. text size overrides). */
  className?: string;
}

/**
 * Render a markdown string as styled GFM markdown for the dark Monolith theme.
 *
 * @example
 * <Markdown>{task.description}</Markdown>
 */
export const Markdown = memo(function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn("text-sm break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;
