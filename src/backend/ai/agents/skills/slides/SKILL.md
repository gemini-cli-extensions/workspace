# Skill: deck-from-outline

Generate a Google Slides deck from a bullet outline.

## When to use
The user provides an outline / topic list and asks for a presentation or "deck".

## Procedure
1. `createPresentation(title)` to get a `presentationId`.
2. For each outline section, `createSlide(id, layout)` choosing a layout that
   fits (TITLE for the first, TITLE_AND_BODY for content slides).
3. Populate placeholders with `insertText(id, objectId, text)`; use the section
   heading as the title and bullets as the body.
4. Where the outline references a known template, prefer
   `createFromTemplate(templateId, replacements)`.
5. Return the presentation URL for preview.

## Guardrails
- One concept per slide; keep bullets to <= 6 per slide.
- Do not exceed ~20 slides without confirming with the user.

## References
- Slides batchUpdate: https://developers.google.com/slides/api/reference/rest/v1/presentations/batchUpdate
