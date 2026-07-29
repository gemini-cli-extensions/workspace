/**
 * @file docs/table-format.ts
 * @description Pure Docs batchUpdate request builders for a themed table:
 * fill cells (bottom-up so inserts don't shift earlier indices), border the
 * grid, and style the header row (fill, white bold centered text). The tool
 * orchestrates: insertTable → fetch → fill → fetch → style.
 */
import type { LocatedTable } from "./locate";

type Rgb = { red: number; green: number; blue: number };
type DocsRequest = Record<string, unknown>;

export interface TableTheme {
  headerBg: Rgb;
  headerText: Rgb;
  border: Rgb;
}

const rgb = (r: number, g: number, b: number): Rgb => ({ red: r / 255, green: g / 255, blue: b / 255 });

export const TABLE_THEMES: Record<string, TableTheme> = {
  default: { headerBg: rgb(31, 78, 121), headerText: rgb(255, 255, 255), border: rgb(0, 0, 0) },
};

const color = (c: Rgb) => ({ color: { rgbColor: c } });
const pt1 = { magnitude: 1, unit: "PT" };

/**
 * insertText for each cell, ordered highest-index-first so an earlier insert
 * never shifts a later (lower-index) cell's target.
 */
export function buildFillRequests(located: LocatedTable, data: string[][], tabId?: string): DocsRequest[] {
  const loc = (index: number) => (tabId ? { index, tabId } : { index });
  return located.cells
    .filter((cell) => (data[cell.rowIndex]?.[cell.colIndex] ?? "") !== "")
    .sort((a, b) => b.startIndex - a.startIndex)
    .map((cell) => ({ insertText: { location: loc(cell.startIndex), text: String(data[cell.rowIndex][cell.colIndex]) } }));
}

/** Grid borders + header fill/text/alignment. `located` must be re-fetched AFTER fills. */
export function buildTableStyleRequests(located: LocatedTable, data: string[][], themeName: string, tabId?: string): DocsRequest[] {
  const theme = TABLE_THEMES[themeName] ?? TABLE_THEMES.default;
  const start = tabId ? { index: located.tableStartIndex, tabId } : { index: located.tableStartIndex };
  const range = (s: number, e: number) => (tabId ? { startIndex: s, endIndex: e, tabId } : { startIndex: s, endIndex: e });
  const border = { color: color(theme.border), width: pt1, dashStyle: "SOLID" };
  const requests: DocsRequest[] = [];

  // Borders on every cell (one request spanning the whole grid).
  requests.push({
    updateTableCellStyle: {
      tableRange: { tableCellLocation: { tableStartLocation: start, rowIndex: 0, columnIndex: 0 }, rowSpan: located.rows, columnSpan: located.cols },
      tableCellStyle: { borderTop: border, borderBottom: border, borderLeft: border, borderRight: border },
      fields: "borderTop,borderBottom,borderLeft,borderRight",
    },
  });

  // Header row fill + vertical centering.
  requests.push({
    updateTableCellStyle: {
      tableRange: { tableCellLocation: { tableStartLocation: start, rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: located.cols },
      tableCellStyle: { backgroundColor: color(theme.headerBg), contentAlignment: "MIDDLE" },
      fields: "backgroundColor,contentAlignment",
    },
  });

  // Header text: white bold, centered — per header cell (uses re-fetched indices).
  for (const cell of located.cells.filter((c) => c.rowIndex === 0)) {
    const text = String(data[0]?.[cell.colIndex] ?? "");
    if (!text) continue;
    requests.push({
      updateTextStyle: {
        range: range(cell.startIndex, cell.startIndex + text.length),
        textStyle: { bold: true, foregroundColor: color(theme.headerText) },
        fields: "bold,foregroundColor",
      },
    });
    requests.push({
      updateParagraphStyle: {
        range: range(cell.startIndex, cell.startIndex + text.length),
        paragraphStyle: { alignment: "CENTER" },
        fields: "alignment",
      },
    });
  }
  return requests;
}
