# Skill: format-from-markdown

Create or update a Google Doc from a Markdown source, preserving structure.

## When to use
The user provides Markdown (or asks to "turn this into a doc") and wants a
formatted Google Doc.

## Procedure
1. If creating new: `createDocument(name, { content, contentFormat: "html" })`
   after converting Markdown headings/lists/bold to minimal HTML.
2. If updating existing: read the doc first (`readDocument`) to find anchors,
   then `appendText` or `batchUpdate` for structural edits.
3. Map Markdown → Docs:
   - `#`/`##`/`###` → HEADING_1/2/3 paragraph styles
   - `**bold**` / `*italic*` → text styles
   - `- ` / `1. ` → bulleted / numbered lists
4. After writing, return the `webViewLink` so the canvas can preview it.

## Guardrails
- Do not overwrite existing content silently; append or confirm replacements.
- Keep one batchUpdate per logical edit group to stay within API limits.

## References
- Docs API batchUpdate: https://developers.google.com/docs/api/reference/rest/v1/documents/batchUpdate
