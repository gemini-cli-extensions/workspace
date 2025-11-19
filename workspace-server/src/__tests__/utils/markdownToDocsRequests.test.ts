/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { parseMarkdownToDocsRequests, processMarkdownLineBreaks } from '../../utils/markdownToDocsRequests';

describe('markdownToDocsRequests', () => {
    describe('parseMarkdownToDocsRequests', () => {
        // Skip tests that rely on marked working if it's not functioning in test environment
        // We'll check markedWorks inside each test instead of using a variable

        it('should handle bold text', () => {
            const markdown = 'This is **bold** text';
            const startIndex = 10;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toBe('This is bold text');
            expect(result.formattingRequests).toHaveLength(1);
            expect(result.formattingRequests[0]).toEqual({
                updateTextStyle: {
                    range: {
                        startIndex: 18, // 10 + 8 (position of "bold")
                        endIndex: 22,    // 10 + 12 (end of "bold")
                    },
                    textStyle: {
                        bold: true,
                    },
                    fields: 'bold'
                }
            });
        });

        it('should handle italic text with asterisks', () => {
            const markdown = 'This is *italic* text';
            const startIndex = 0;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toBe('This is italic text');
            expect(result.formattingRequests).toHaveLength(1);
            expect(result.formattingRequests[0]).toEqual({
                updateTextStyle: {
                    range: {
                        startIndex: 8,
                        endIndex: 14,
                    },
                    textStyle: {
                        italic: true,
                    },
                    fields: 'italic'
                }
            });
        });

        it('should handle italic text with underscores', () => {
            const markdown = 'This is _italic_ text';
            const startIndex = 0;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toBe('This is italic text');
            expect(result.formattingRequests).toHaveLength(1);
            expect(result.formattingRequests[0].updateTextStyle?.textStyle?.italic).toBe(true);
        });

        it('should handle inline code', () => {
            const markdown = 'This is `code` text';
            const startIndex = 0;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toBe('This is code text');
            expect(result.formattingRequests).toHaveLength(1);
            expect(result.formattingRequests[0]).toEqual({
                updateTextStyle: {
                    range: {
                        startIndex: 8,
                        endIndex: 12,
                    },
                    textStyle: {
                        weightedFontFamily: {
                            fontFamily: 'Courier New',
                            weight: 400
                        },
                        backgroundColor: {
                            color: {
                                rgbColor: {
                                    red: 0.95,
                                    green: 0.95,
                                    blue: 0.95
                                }
                            }
                        }
                    },
                    fields: 'weightedFontFamily,backgroundColor'
                }
            });
        });

        it('should handle multiple formatting in one text', () => {
            const markdown = 'Text with **bold**, *italic*, and `code` formatting';
            const startIndex = 0;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toBe('Text with bold, italic, and code formatting');
            expect(result.formattingRequests).toHaveLength(3);
        });

        it('should handle text with no formatting', () => {
            const markdown = 'Plain text without any formatting';
            const startIndex = 0;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toBe('Plain text without any formatting');
            expect(result.formattingRequests).toHaveLength(0);
        });

        it('should handle overlapping formatting (keeps first)', () => {
            const markdown = '**bold and text**';
            const startIndex = 0;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            // The bold formatting should be applied
            expect(result.plainText).toBe('bold and text');
            expect(result.formattingRequests).toHaveLength(1);
            expect(result.formattingRequests[0].updateTextStyle?.textStyle?.bold).toBe(true);
        });

        it('should respect the startIndex parameter', () => {
            const markdown = '**bold**';
            const startIndex = 100;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toBe('bold');
            expect(result.formattingRequests[0]).toEqual({
                updateTextStyle: {
                    range: {
                        startIndex: 100,
                        endIndex: 104,
                    },
                    textStyle: {
                        bold: true,
                    },
                    fields: 'bold'
                }
            });
        });

        it('should handle heading 1', () => {
            const markdown = '# Main Title';
            const startIndex = 0;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toBe('Main Title');
            expect(result.formattingRequests).toHaveLength(1);
            expect(result.formattingRequests[0].updateParagraphStyle?.paragraphStyle?.namedStyleType).toBe('HEADING_1');
            expect(result.formattingRequests[0].updateParagraphStyle?.range?.startIndex).toBe(0);
            expect(result.formattingRequests[0].updateParagraphStyle?.range?.endIndex).toBe(10);
        });

        it('should handle heading 2', () => {
            const markdown = '## Section Title';
            const startIndex = 0;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toBe('Section Title');
            expect(result.formattingRequests).toHaveLength(1);
            expect(result.formattingRequests[0].updateParagraphStyle?.paragraphStyle?.namedStyleType).toBe('HEADING_2');
            expect(result.formattingRequests[0].updateParagraphStyle?.range?.startIndex).toBe(0);
            expect(result.formattingRequests[0].updateParagraphStyle?.range?.endIndex).toBe(13);
        });

        it('should handle heading 3', () => {
            const markdown = '### Subsection';
            const startIndex = 0;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toBe('Subsection');
            expect(result.formattingRequests).toHaveLength(1);
            expect(result.formattingRequests[0].updateParagraphStyle?.paragraphStyle?.namedStyleType).toBe('HEADING_3');
            expect(result.formattingRequests[0].updateParagraphStyle?.range?.startIndex).toBe(0);
            expect(result.formattingRequests[0].updateParagraphStyle?.range?.endIndex).toBe(10);
        });

        it('should handle mixed headings and text', () => {
            const markdown = '# Title\n\nSome text\n\n## Section\n\nMore text';
            const startIndex = 0;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toContain('Title');
            expect(result.plainText).toContain('Some text');
            expect(result.plainText).toContain('Section');
            expect(result.plainText).toContain('More text');

            // Should have formatting for both headings
            const headingFormats = result.formattingRequests.filter(req =>
                req.updateParagraphStyle?.paragraphStyle?.namedStyleType !== undefined
            );
            expect(headingFormats).toHaveLength(2);
        });

        it('should handle inline formatting within headings', () => {
            const markdown = '# Main **bold** Title';
            const startIndex = 0;
            const result = parseMarkdownToDocsRequests(markdown, startIndex);

            expect(result.plainText).toBe('Main bold Title');

            // Should have both heading and bold formatting
            const headingFormat = result.formattingRequests.find(req =>
                req.updateParagraphStyle?.paragraphStyle?.namedStyleType !== undefined
            );
            const boldFormat = result.formattingRequests.find(req =>
                req.updateTextStyle?.textStyle?.bold === true
            );

            expect(headingFormat).toBeDefined();
            expect(boldFormat).toBeDefined();
        });
    });

    describe('processMarkdownLineBreaks', () => {
        it('should preserve single line breaks', () => {
            const text = 'Line 1\nLine 2';
            const result = processMarkdownLineBreaks(text);
            expect(result).toBe('Line 1\nLine 2');
        });

        it('should convert double line breaks to double', () => {
            const text = 'Paragraph 1\n\nParagraph 2';
            const result = processMarkdownLineBreaks(text);
            expect(result).toBe('Paragraph 1\n\nParagraph 2');
        });

        it('should convert multiple line breaks to double', () => {
            const text = 'Paragraph 1\n\n\n\nParagraph 2';
            const result = processMarkdownLineBreaks(text);
            expect(result).toBe('Paragraph 1\n\nParagraph 2');
        });

        it('should handle text without line breaks', () => {
            const text = 'Single line of text';
            const result = processMarkdownLineBreaks(text);
            expect(result).toBe('Single line of text');
        });
    });
});