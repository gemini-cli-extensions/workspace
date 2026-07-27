# Skill: csv-import

Import CSV/tabular data into a Google Sheet cleanly.

## When to use
The user pastes CSV or asks to "put this data in a sheet" / "import this table".

## Procedure
1. Parse the CSV into a 2D array of rows. Treat the first row as headers unless
   told otherwise.
2. Create the target: `createSpreadsheet(title)` (or reuse a given id).
3. Write the full range in one call: `write(id, "Sheet1!A1", values)`.
4. Optionally `setBasicFilter` over the header range for usability.
5. Return the spreadsheet URL for the canvas preview.

## Guardrails
- Coerce numbers/dates only when unambiguous; otherwise keep as text.
- Batch writes — never write cell-by-cell.

## References
- Sheets values.update: https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/update
