/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock implementation of jsdom for Jest tests
 * 
 * This mock provides the minimal DOM functionality needed by our code:
 * 1. DocsService uses JSDOM to create a window object for DOMPurify
 * 2. markdownToDocsRequests uses JSDOM to parse HTML from marked
 */

class MockElement {
    tagName: string;
    textContent: string;
    nodeType: number;
    childNodes: MockNode[];
    nextSibling: MockNode | null;
    attributes: { [key: string]: string };

    constructor(tagName: string) {
        this.tagName = tagName;
        this.textContent = '';
        this.nodeType = 1; // Element node
        this.childNodes = [];
        this.nextSibling = null;
        this.attributes = {};
    }

    toLowerCase() {
        return this.tagName.toLowerCase();
    }

    getAttribute(name: string): string | null {
        return this.attributes[name] || null;
    }
}

class MockTextNode {
    nodeType: number;
    textContent: string;
    childNodes: never[];
    nextSibling: MockNode | null;

    constructor(text: string) {
        this.nodeType = 3; // Text node
        this.textContent = text;
        this.childNodes = [];
        this.nextSibling = null;
    }
}

type MockNode = MockElement | MockTextNode;

class MockDocument {
    body: MockElement;

    constructor() {
        this.body = new MockElement('BODY');
    }

    createElement(tagName: string): MockElement {
        return new MockElement(tagName.toUpperCase());
    }

    querySelector(selector: string): MockElement | null {
        // Simple implementation for our use case (mostly just tag names)
        const tagName = selector.toUpperCase();

        const queue: MockNode[] = [...this.body.childNodes];
        while (queue.length > 0) {
            const node = queue.shift()!;
            if (node instanceof MockElement) {
                if (node.tagName === tagName) {
                    return node;
                }
                queue.push(...node.childNodes);
            }
        }
        
        return null;
    }
}

class MockWindow {
    document: MockDocument;
    DOMParser: typeof MockDOMParser;

    constructor() {
        this.document = new MockDocument();
        this.DOMParser = MockDOMParser;
    }
}

class MockDOMParser {
    parseFromString(html: string): { body: MockElement } {
        const body = new MockElement('BODY');
        this.parseNodes(html, body);
        return { body };
    }

    private parseNodes(html: string, parent: MockElement) {
        // Parse simple HTML tags and text
        // Note: This regex is very simple and won't handle attributes or self-closing tags well
        // but it's sufficient for the markdown output we're testing
        const tagRegex = /<(\w+)(?:\s+[^>]*)?>(.*?)<\/\1>|([^<]+)/gs;
        let match;
        
        while ((match = tagRegex.exec(html)) !== null) {
            if (match[1]) {
                // It's a tag
                const tagName = match[1].toUpperCase();
                const element = new MockElement(tagName);
                const content = match[2];
                
                // Handle attributes (simple href for links)
                const fullTag = match[0];
                const hrefMatch = fullTag.match(/href=["']([^"']*)["']/);
                if (hrefMatch) {
                    element.attributes['href'] = hrefMatch[1];
                }
                
                // Recursively parse content
                this.parseNodes(content, element);
                
                parent.childNodes.push(element);
            } else if (match[3]) {
                // It's text content
                const text = match[3];
                if (text) {
                    const textNode = new MockTextNode(text);
                    parent.childNodes.push(textNode);
                }
            }
        }
        
        // Set next sibling references
        for (let i = 0; i < parent.childNodes.length - 1; i++) {
            parent.childNodes[i].nextSibling = parent.childNodes[i + 1];
        }
    }
}

export class JSDOM {
    window: MockWindow;

    constructor(html?: string) {
        this.window = new MockWindow();
        
        if (html) {
            const parser = new MockDOMParser();
            const parsed = parser.parseFromString(html);
            this.window.document.body = parsed.body;
        }
    }
}
