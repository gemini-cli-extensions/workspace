/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Minimal markdown parser for docs.appendMarkdown.
 *
 * Parses a markdown string into a flat list of blocks (headings, list items,
 * paragraphs, horizontal rules) with inline formatting recorded as character
 * ranges over the stripped plain text. The ranges map directly onto Docs API
 * updateTextStyle requests, so no index arithmetic ever reaches the model.
 *
 * Intentionally simple, single-pass semantics:
 * - Inline markers do not nest (e.g. italic inside bold is not split out).
 * - Tables are not parsed; pipe rows fall through as plain paragraphs.
 */

export interface InlineFormat {
  type: 'bold' | 'italic' | 'strikethrough' | 'code' | 'link';
  /** Start offset (inclusive) within the stripped plain text of the block. */
  start: number;
  /** End offset (exclusive) within the stripped plain text of the block. */
  end: number;
  url?: string;
}

export type MarkdownBlock =
  | {
      type: 'heading';
      level: number;
      text: string;
      formats: InlineFormat[];
    }
  | {
      type: 'bullet' | 'numbered' | 'paragraph';
      text: string;
      formats: InlineFormat[];
    }
  | { type: 'hr' };

const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)/;

/**
 * Strips inline markdown markers from a single line of text, recording the
 * formatted ranges over the stripped output.
 */
export function stripInlineMarkdown(input: string): {
  text: string;
  formats: InlineFormat[];
} {
  const formats: InlineFormat[] = [];
  let out = '';
  let i = 0;

  const tryMarker = (marker: string, type: InlineFormat['type']): boolean => {
    if (!input.startsWith(marker, i)) return false;
    const close = input.indexOf(marker, i + marker.length);
    // No closer, or empty content ("****"): treat as literal text.
    if (close === -1 || close === i + marker.length) return false;
    const inner = input.slice(i + marker.length, close);
    const start = out.length;
    out += inner;
    formats.push({ type, start, end: out.length });
    i = close + marker.length;
    return true;
  };

  while (i < input.length) {
    if (input[i] === '[') {
      const m = LINK_RE.exec(input.slice(i));
      if (m) {
        const start = out.length;
        out += m[1];
        formats.push({ type: 'link', start, end: out.length, url: m[2] });
        i += m[0].length;
        continue;
      }
    }
    if (tryMarker('**', 'bold')) continue;
    if (tryMarker('~~', 'strikethrough')) continue;
    if (tryMarker('`', 'code')) continue;
    if (tryMarker('*', 'italic')) continue;
    if (tryMarker('_', 'italic')) continue;
    out += input[i];
    i++;
  }

  return { text: out, formats };
}

/**
 * Parses markdown into a flat list of blocks. One block per list item
 * (consecutive items are merged into a single createParagraphBullets range by
 * the consumer), blank lines are skipped.
 */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];

  for (const line of markdown.split('\n')) {
    if (line.trim() === '') continue;

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const parsed = stripInlineMarkdown(heading[2]);
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: parsed.text,
        formats: parsed.formats,
      });
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      const parsed = stripInlineMarkdown(bullet[1]);
      blocks.push({
        type: 'bullet',
        text: parsed.text,
        formats: parsed.formats,
      });
      continue;
    }

    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      const parsed = stripInlineMarkdown(numbered[1]);
      blocks.push({
        type: 'numbered',
        text: parsed.text,
        formats: parsed.formats,
      });
      continue;
    }

    const parsed = stripInlineMarkdown(line);
    blocks.push({
      type: 'paragraph',
      text: parsed.text,
      formats: parsed.formats,
    });
  }

  return blocks;
}
