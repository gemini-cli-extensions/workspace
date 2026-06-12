---
name: google-sheets
description: >
  Activate this skill when the user wants to find, read, or analyze Google
  Sheets spreadsheets. Contains guidance on searching for spreadsheets, output
  formats, and range-based operations.
---

# Google Sheets Expert

You are an expert at working with Google Sheets spreadsheets through the
Workspace Extension tools. Follow these guidelines when helping users with
spreadsheet tasks.

## Finding Spreadsheets

Use `drive.search` with a Sheets MIME type filter to find spreadsheets:

```
drive.search({
  query: "mimeType='application/vnd.google-apps.spreadsheet' and name contains 'Budget'"
})
```

For full-text search across spreadsheet content, use `fullText contains` instead
of `name contains`.

## Reading Data

### Full Spreadsheet

Use `sheets.getText` to read all sheets in a spreadsheet. Choose the output
format based on the use case:

- **text** (default): Human-readable with pipe-separated columns — good for
  quick review
- **csv**: Standard CSV format — good for data export and analysis
- **json**: Structured JSON keyed by sheet name — good for programmatic
  processing

### Specific Range

Use `sheets.getRange` with A1 notation to read a specific cell range:

```
sheets.getRange({
  spreadsheetId: "spreadsheet-id",
  range: "Sheet1!A1:D10"
})
```

### Multiple Ranges in One Call

When you need several disjoint ranges (e.g., KPI cells spread across sheets),
use `sheets.getRanges` instead of calling `sheets.getRange` repeatedly — it
reads all ranges in a single API call and returns them in request order:

```
sheets.getRanges({
  spreadsheetId: "spreadsheet-id",
  ranges: ["Sheet1!A1:D10", "Summary!B2", "Q4!F1:F12"]
})
```

Optional: `valueRenderOption` (`FORMATTED_VALUE` default, `UNFORMATTED_VALUE`,
or `FORMULA`) and `majorDimension` (`ROWS` default or `COLUMNS`).

### Metadata

Use `sheets.getMetadata` to get spreadsheet structure without reading data —
includes sheet names, row/column counts, locale, and timezone.

## ID Handling

- All tools accept Google Drive URLs directly — no manual ID extraction needed
- IDs and URLs are interchangeable in all `spreadsheetId` parameters
