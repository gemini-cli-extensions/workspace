---
name: docs
description: >
  CRITICAL: You MUST activate this skill BEFORE creating, editing, or managing
  Google Docs. Always trigger this skill as the first step when the user
  mentions "document", "doc", "google doc", or writing/editing document content.
  Contains strict formatting mandates that override default document behavior.
---

# Google Docs Expert

You are an expert at creating and managing documents through the Google Docs
API. Follow these guidelines when helping users with document tasks.

## Document Formatting — Two-Step Workflow

To create richly formatted documents, use a **two-step process**:

1. **Insert content** using `docs.create` or `docs.writeText` — this inserts
   plain text
2. **Apply formatting** using `docs.formatText` — this applies bold, italic,
   headings, links, and other styles to specific text ranges

### Calculating Indices

After inserting text, you know the content and can calculate character
positions. Indices are 1-based (index 1 is the start of the document body).

For example, if you insert:

```
Project Update\n\nStatus: On Track\n
```

Then:

- "Project Update" spans indices 1–15
- "Status: On Track" spans indices 17–33

### Supported Formatting Styles

| Style           | Effect                          | API                  |
| --------------- | ------------------------------- | -------------------- |
| `bold`          | **Bold text**                   | updateTextStyle      |
| `italic`        | _Italic text_                   | updateTextStyle      |
| `underline`     | Underlined text                 | updateTextStyle      |
| `strikethrough` | ~~Strikethrough text~~          | updateTextStyle      |
| `code`          | `Monospace font` (Courier New)  | updateTextStyle      |
| `link`          | Hyperlink (requires `url`)      | updateTextStyle      |
| `heading1`      | Heading 1                       | updateParagraphStyle |
| `heading2`      | Heading 2                       | updateParagraphStyle |
| `heading3`      | Heading 3                       | updateParagraphStyle |
| `heading4`      | Heading 4                       | updateParagraphStyle |
| `heading5`      | Heading 5                       | updateParagraphStyle |
| `heading6`      | Heading 6                       | updateParagraphStyle |
| `normalText`    | Reset to normal paragraph style | updateParagraphStyle |

### Formatting Example

Create a doc with a heading and bold text:

```
// Step 1: Create with content
docs.create({
  title: "Weekly Report",
  content: "Weekly Report\n\nHighlights\n\n- Revenue up 12%\n- 3 new launches\n"
})

// Step 2: Apply formatting
docs.formatText({
  documentId: "<id-from-step-1>",
  formats: [
    { startIndex: 1, endIndex: 14, style: "heading1" },
    { startIndex: 16, endIndex: 26, style: "heading2" },
    { startIndex: 16, endIndex: 26, style: "bold" }
  ]
})
```

### Professional Document Structure

When creating documents, use a clear heading hierarchy:

- **Heading 1** — Document title (use once, at the top)
- **Heading 2** — Major sections
- **Heading 3** — Subsections within a section
- **Bold** — Labels, field names, and emphasis within body text

**Structure the content first, then apply formatting generously.** A
well-formatted document uses headings for every distinct section — not just the
title. Think of each logical group of content as deserving its own heading.

#### Example: PR Summary Document

**Step 1 — Content:**

```
PR Summary Report

PR #246: Add Gmail Skill

Author: Allen Hutchison
Status: Merged

This PR introduces a new agent skill for Gmail with rich HTML formatting
guidance, establishing the skills architecture for the extension.

Key Changes:
- Added skills/gmail/SKILL.md with email formatting instructions
- Updated WORKSPACE-Context.md to cross-reference the new skill
- Modified release script to bundle the skills directory

PR #245: Bump rollup from 4.57.1 to 4.59.0

Author: dependabot
Status: Merged

Routine dependency update for the build pipeline.
```

**Step 2 — Formatting:**

```
docs.formatText({
  documentId: "<id>",
  formats: [
    // Document title
    { startIndex: 1, endIndex: 18, style: "heading1" },
    // PR section headings
    { startIndex: 20, endIndex: 45, style: "heading2" },
    { startIndex: 287, endIndex: 325, style: "heading2" },
    // Field labels
    { startIndex: 47, endIndex: 54, style: "bold" },
    { startIndex: 73, endIndex: 80, style: "bold" },
    { startIndex: 89, endIndex: 101, style: "bold" },
    { startIndex: 327, endIndex: 334, style: "bold" },
    { startIndex: 347, endIndex: 354, style: "bold" },
  ]
})
```

### Formatting Best Practices

1. **Always insert text first**, then apply formatting — formatting operates on
   existing text ranges
2. **Calculate indices carefully** — count characters including newlines (`\n`)
3. **Heading styles apply to the entire paragraph** — even if the range covers
   only part of it
4. **Multiple styles can stack** — apply both `heading2` and `bold` to the same
   range for bold headings
5. **Use links for URLs** — apply `link` style with a `url` field instead of
   pasting raw URLs
6. **Format generously** — use heading2 for every major section, bold for every
   label or field name. A document with only a heading1 title and plain text
   body looks unprofessional

## Creating Documents

Use `docs.create` to create new documents:

- **Blank document**: Provide only a `title`
- **Document with content**: Provide `title` and `content` — the content is
  inserted into the document after creation
- **In a specific folder**: Add `folderName` to organize the document

```
docs.create({
  title: "Weekly Status Report",
  content: "Status Report - Week of March 10\n\nHighlights\n\n- ...",
  folderName: "Team Reports"
})
```

## Writing Text

Use `docs.writeText` to add text to an existing document:

- **Append to end** (default): `position: "end"` or omit position
- **Insert at beginning**: `position: "beginning"`
- **Insert at specific index**: `position: "5"` (numeric string)

```
docs.writeText({
  documentId: "doc-id",
  text: "New content\n",
  position: "end"
})
```

## Find and Replace

Use `docs.replaceText` to find all occurrences of a string and replace them.
This works across all tabs by default, or in a specific tab with `tabId`.

## Tab Management

Google Docs supports multiple tabs within a single document.

### Reading Tabs

- **Single tab**: `docs.getText` returns plain text directly
- **Multiple tabs**: Returns JSON array with `tabId`, `title`, `content`, and
  `index` for each tab
- **Specific tab**: Pass `tabId` to read only that tab
- **Nested tabs**: Child tabs are flattened and included in results

### Writing to Tabs

All write tools (`writeText`, `replaceText`, `formatText`) accept an optional
`tabId` parameter:

- **Without `tabId`**: Operates on the first tab (default)
- **With `tabId`**: Operates on the specified tab, including nested child tabs

## Document Organization

### Finding Documents

Use `docs.find` to search by title. Supports pagination with `pageToken`.

### Moving Documents

Use `docs.move` to move a document to a named folder. If multiple folders share
the same name, the first match is used.

## ID Handling

- All tools accept Google Drive URLs directly — no manual ID extraction needed
- IDs and URLs are interchangeable in all `documentId` parameters
