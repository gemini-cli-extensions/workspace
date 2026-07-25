/**
 * @fileoverview MarkdownText — renders an assistant text message part as
 * GitHub-flavoured Markdown styled for the dark Monolith theme.
 *
 * WHY a bespoke renderer (and not `@assistant-ui/react-markdown`):
 * the latest `@assistant-ui/react-markdown` peer-requires `@assistant-ui/react`
 * `^0.14.18`, which is incompatible with the pinned `0.12.28` ↔
 * `@cloudflare/ai-chat@0.7.1` bridge. So we render with plain `react-markdown`
 * (9.x, React-19 safe) + `remark-gfm` (4.x) and route fenced code blocks through
 * the project's existing Shiki-powered `CodeBlock`.
 *
 * The element→style mapping lives in the shared
 * {@link file://../ui/markdown-components.tsx} map so the assistant thread and
 * the general-purpose {@link file://../ui/markdown.tsx} string renderer stay
 * visually identical.
 *
 * The component is memoized on the raw markdown string: assistant text parts
 * re-render on every stream delta, so memoizing keeps `react-markdown`'s parse
 * off the hot path unless the text actually changed.
 *
 * SSR: this file is only ever imported by `client:only="react"` islands. It does
 * not touch `window` directly, but `CodeBlock` highlights inside a browser
 * effect, so it must never be hydrated server-side.
 */

"use client";

import { memo } from "react";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { markdownComponents } from "@/components/ui/markdown-components";

/** Props for {@link MarkdownText}. */
export interface MarkdownTextProps {
  /** The raw markdown source for one assistant text part. */
  text: string;
}

/**
 * Render an assistant text part as styled GFM markdown.
 *
 * Designed to be dropped straight into `MessagePrimitive.Parts`'s `Text`
 * component slot.
 */
export const MarkdownText = memo(function MarkdownText({ text }: MarkdownTextProps) {
  return (
    <div className="text-sm break-words">
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </Markdown>
    </div>
  );
});
