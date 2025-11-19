/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { docs_v1 } from 'googleapis';
import { marked } from 'marked';
import { JSDOM } from 'jsdom';

interface FormatRange {
    start: number;
    end: number;
    type: 'bold' | 'italic' | 'code' | 'link' | 'heading';
    url?: string;
    headingLevel?: number;
    isParagraph?: boolean;
}

interface ParsedMarkdown {
    plainText: string;
    formattingRequests: docs_v1.Schema$Request[];
}

/**
 * Parses markdown text and generates Google Docs API requests for formatting.
 * Uses the marked library to convert to HTML, then parses the HTML to extract formatting.
 */
export function parseMarkdownToDocsRequests(markdown: string, startIndex: number): ParsedMarkdown {
    // Split markdown into lines to handle block elements like headings
    const lines = markdown.split('\n');
    const htmlParts: string[] = [];

    for (const line of lines) {
        // Check if this is a heading line
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const content = headingMatch[2];
            // Parse inline content within the heading
            try {
                const inlineHtml = marked.parseInline(content) as string;
                htmlParts.push(`<h${level}>${inlineHtml}</h${level}>`);
            } catch (error) {
                console.error('Markdown parsing failed for heading, falling back to raw content:', error);
                htmlParts.push(`<h${level}>${content}</h${level}>`);
            }
        } else if (line.trim()) {
            // For non-heading, non-empty lines, use parseInline
            try {
                const inlineHtml = marked.parseInline(line) as string;
                htmlParts.push(`<p>${inlineHtml}</p>`);
            } catch (error) {
                console.error('Markdown parsing failed for line, falling back to raw content:', error);
                htmlParts.push(`<p>${line}</p>`);
            }
        } else {
            // Empty lines become paragraph breaks
            htmlParts.push('');
        }
    }

    // Convert markdown to HTML - handle both block and inline elements
    const html = htmlParts.join('\n');

    // If no conversion happened, return plain text
    if (!html || html === markdown) {
        return {
            plainText: markdown,
            formattingRequests: []
        };
    }

    // Parse HTML to extract text and formatting
    // Create a wrapper div to handle inline HTML that might not have a parent element
    const dom = new JSDOM(`<div>${html}</div>`);
    const document = dom.window.document;
    const wrapper = document.querySelector('div');

    const formattingRanges: FormatRange[] = [];
    let plainText = '';
    let currentPos = 0;

    // Recursive function to process nodes
    function processNode(node: Node) {
        if (node.nodeType === 3) { // Text node
            const text = node.textContent || '';
            plainText += text;
            currentPos += text.length;
        } else if (node.nodeType === 1) { // Element node
            const element = node as HTMLElement;
            const tagName = element.tagName.toLowerCase();

            const start = currentPos;

            // Process children first to get the text content
            for (const child of Array.from(node.childNodes)) {
                processNode(child);
            }

            const end = currentPos;

            // Record formatting based on tag
            if (tagName === 'strong' || tagName === 'b') {
                formattingRanges.push({ start, end, type: 'bold' });
            } else if (tagName === 'em' || tagName === 'i') {
                formattingRanges.push({ start, end, type: 'italic' });
            } else if (tagName === 'code') {
                formattingRanges.push({ start, end, type: 'code' });
            } else if (tagName === 'a') {
                const href = element.getAttribute('href') || '';
                formattingRanges.push({ start, end, type: 'link', url: href });
            } else if (tagName.match(/^h[1-6]$/)) {
                const level = parseInt(tagName.charAt(1));
                // Mark the entire paragraph range for heading style
                formattingRanges.push({ start, end, type: 'heading', headingLevel: level, isParagraph: true });
            } else if (tagName === 'p') {
                // Add newline after paragraph content if not the last element
                const nextSibling = element.nextSibling;
                if (nextSibling && nextSibling.nodeType === 1) {
                    plainText += '\n';
                    currentPos += 1;
                }
            }
        }
    }

    // Process all nodes
    if (wrapper) {
        for (const child of Array.from(wrapper.childNodes)) {
            processNode(child);
        }
    } else {
        // If parsing failed, just use the plain markdown (no formatting)
        plainText = markdown;
    }

    // Generate formatting requests
    const formattingRequests: docs_v1.Schema$Request[] = [];

    for (const range of formattingRanges) {
        const textStyle: docs_v1.Schema$TextStyle = {};
        const fields: string[] = [];

        if (range.type === 'bold') {
            textStyle.bold = true;
            fields.push('bold');
        } else if (range.type === 'italic') {
            textStyle.italic = true;
            fields.push('italic');
        } else if (range.type === 'code') {
            textStyle.weightedFontFamily = {
                fontFamily: 'Courier New',
                weight: 400
            };
            textStyle.backgroundColor = {
                color: {
                    rgbColor: {
                        red: 0.95,
                        green: 0.95,
                        blue: 0.95
                    }
                }
            };
            fields.push('weightedFontFamily', 'backgroundColor');
        } else if (range.type === 'link' && range.url) {
            textStyle.link = {
                url: range.url
            };
            textStyle.foregroundColor = {
                color: {
                    rgbColor: {
                        red: 0.06,
                        green: 0.33,
                        blue: 0.80
                    }
                }
            };
            textStyle.underline = true;
            fields.push('link', 'foregroundColor', 'underline');
        } else if (range.type === 'heading' && range.headingLevel && range.isParagraph) {
            // Use updateParagraphStyle for headings as per Google Docs API best practices
            const headingStyles: { [key: number]: string } = {
                1: 'HEADING_1',
                2: 'HEADING_2',
                3: 'HEADING_3',
                4: 'HEADING_4',
                5: 'HEADING_5',
                6: 'HEADING_6'
            };

            const namedStyleType = headingStyles[range.headingLevel] || 'HEADING_1';

            // Create a separate updateParagraphStyle request for headings
            formattingRequests.push({
                updateParagraphStyle: {
                    paragraphStyle: {
                        namedStyleType: namedStyleType
                    },
                    range: {
                        startIndex: startIndex + range.start,
                        endIndex: startIndex + range.end
                    },
                    fields: 'namedStyleType'
                }
            });

            // Skip the normal text style formatting for headings
            continue;
        }

        if (fields.length > 0) {
            formattingRequests.push({
                updateTextStyle: {
                    range: {
                        startIndex: startIndex + range.start,
                        endIndex: startIndex + range.end
                    },
                    textStyle: textStyle,
                    fields: fields.join(',')
                }
            });
        }
    }

    return {
        plainText,
        formattingRequests
    };
}

/**
 * Handles line breaks and paragraphs in markdown text
 */
export function processMarkdownLineBreaks(text: string): string {
    // Convert double line breaks to paragraph breaks
    // Single line breaks remain as-is
    return text.replace(/\n\n+/g, '\n\n');
}