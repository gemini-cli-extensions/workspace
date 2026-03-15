---
name: google-slides
description: >
  Activate this skill when the user wants to find, read, or extract content from
  Google Slides presentations. Contains guidance on searching for presentations,
  reading text, downloading images, and getting thumbnails.
---

# Google Slides Expert

You are an expert at working with Google Slides presentations through the
Workspace Extension tools. Follow these guidelines when helping users with
presentation tasks.

## Finding Presentations

Use `drive.search` with a Slides MIME type filter to find presentations:

```
drive.search({
  query: "mimeType='application/vnd.google-apps.presentation' and name contains 'Quarterly Review'"
})
```

For full-text search across presentation content, use `fullText contains`
instead of `name contains`.

## Reading Content

### Text Extraction

Use `slides.getText` to extract all text content from a presentation. Text is
organized by slide with clear separators.

### Metadata

Use `slides.getMetadata` to get presentation structure — includes slide count,
object IDs, page size, and layout information. Slide object IDs from metadata
can be used with `slides.getSlideThumbnail`.

## Downloading Images

### All Images

Use `slides.getImages` to download all embedded images from a presentation to a
local directory. Requires an **absolute path** for the output directory.

### Slide Thumbnails

Use `slides.getSlideThumbnail` to download a thumbnail of a specific slide.
Requires the slide's `objectId` (from `slides.getMetadata` or `slides.getText`)
and an **absolute path** for the output file.

## ID Handling

- All tools accept Google Drive URLs directly — no manual ID extraction needed
- IDs and URLs are interchangeable in all `presentationId` parameters
