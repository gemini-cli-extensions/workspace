/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { parseMarkdownBlocks, stripInlineMarkdown } from '../../utils/markdown';

describe('stripInlineMarkdown', () => {
  it('strips bold, italic, strikethrough, and code markers and records ranges', () => {
    const out = stripInlineMarkdown('a **b** *c* ~~d~~ `e`');
    expect(out.text).toBe('a b c d e');
    expect(out.formats).toEqual([
      { type: 'bold', start: 2, end: 3 },
      { type: 'italic', start: 4, end: 5 },
      { type: 'strikethrough', start: 6, end: 7 },
      { type: 'code', start: 8, end: 9 },
    ]);
  });

  it('records links with their URL', () => {
    const out = stripInlineMarkdown('see [the docs](https://example.com) now');
    expect(out.text).toBe('see the docs now');
    expect(out.formats).toEqual([
      { type: 'link', start: 4, end: 12, url: 'https://example.com' },
    ]);
  });

  it('supports underscore italics', () => {
    const out = stripInlineMarkdown('_hi_');
    expect(out.text).toBe('hi');
    expect(out.formats).toEqual([{ type: 'italic', start: 0, end: 2 }]);
  });

  it('leaves markers with no closer as literal text', () => {
    const out = stripInlineMarkdown('a *b and c');
    expect(out.text).toBe('a *b and c');
    expect(out.formats).toEqual([]);
  });

  it('degrades an unclosed double marker to a literal star plus a paired single marker', () => {
    // "**" has no closing "**", so the first star stays literal and the
    // second pairs with the lone star later in the line.
    const out = stripInlineMarkdown('a **b and *c');
    expect(out.text).toBe('a *b and c');
    expect(out.formats).toEqual([{ type: 'italic', start: 3, end: 9 }]);
  });

  it('treats empty markers as literal text', () => {
    const out = stripInlineMarkdown('****');
    expect(out.text).toBe('****');
    expect(out.formats).toEqual([]);
  });
});

describe('parseMarkdownBlocks', () => {
  it('parses headings with levels and stripped inline formats', () => {
    const blocks = parseMarkdownBlocks('# Title\n###### **Deep**');
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Title', formats: [] },
      {
        type: 'heading',
        level: 6,
        text: 'Deep',
        formats: [{ type: 'bold', start: 0, end: 4 }],
      },
    ]);
  });

  it('emits one block per list item, allowing leading whitespace', () => {
    const blocks = parseMarkdownBlocks('- a\n  - b\n1. one\n2. two');
    expect(blocks).toEqual([
      { type: 'bullet', text: 'a', formats: [] },
      { type: 'bullet', text: 'b', formats: [] },
      { type: 'numbered', text: 'one', formats: [] },
      { type: 'numbered', text: 'two', formats: [] },
    ]);
  });

  it('parses horizontal rules and skips blank lines', () => {
    const blocks = parseMarkdownBlocks('\n---\n\n***\n');
    expect(blocks).toEqual([{ type: 'hr' }, { type: 'hr' }]);
  });

  it('falls through to paragraphs (including pipe rows, which are not parsed as tables)', () => {
    const blocks = parseMarkdownBlocks('plain text\n| a | b |');
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'plain text', formats: [] },
      { type: 'paragraph', text: '| a | b |', formats: [] },
    ]);
  });

  it('parses a mixed document in order', () => {
    const blocks = parseMarkdownBlocks('# T\n\nintro **x**\n\n- a\n- b');
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'bullet',
      'bullet',
    ]);
  });
});
