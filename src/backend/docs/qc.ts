/**
 * @file docs/qc.ts
 * @description Pure structural QC for a Google Doc's braille (raw JSON). Catches
 * the white-glove pain points that ARE visible in the AST — headings that will
 * orphan (no keepWithNext), tables with no borders, stranded empty paragraphs.
 * Layout-only issues (a table spilling two pages) need the rendered PDF and live
 * in the vision QC slice. Also builds the batchUpdate requests to auto-fix the
 * safe ones (keepWithNext, table borders).
 */
import { docBodyContent } from "./locate";

export type QcSeverity = "info" | "warn" | "crit";

export interface QcFinding {
  rule: string;
  severity: QcSeverity;
  detail: string;
  /** Paragraph range (for keepWithNext fixes). */
  startIndex?: number;
  endIndex?: number;
  /** Table element start (for border fixes). */
  tableStart?: number;
  rows?: number;
  cols?: number;
}

const isHeading = (el: any) => typeof el?.paragraph?.paragraphStyle?.namedStyleType === "string" && el.paragraph.paragraphStyle.namedStyleType.startsWith("HEADING");

const paragraphText = (el: any): string =>
  (el?.paragraph?.elements ?? []).map((e: any) => e?.textRun?.content ?? "").join("");

const tableHasBorder = (el: any): boolean => {
  const cell = el?.table?.tableRows?.[0]?.tableCells?.[0];
  const w = cell?.tableCellStyle?.borderTop?.width?.magnitude;
  return typeof w === "number" && w > 0;
};

/** Structural QC findings for a doc. */
export function lintDoc(rawDoc: any, tabId?: string): QcFinding[] {
  const content = docBodyContent(rawDoc, tabId);
  const findings: QcFinding[] = [];

  content.forEach((el: any, i: number) => {
    if (isHeading(el)) {
      if (el.paragraph.paragraphStyle.keepWithNext !== true) {
        findings.push({
          rule: "heading-no-keepwithnext",
          severity: "warn",
          detail: `Heading "${paragraphText(el).trim().slice(0, 40)}" may orphan at a page bottom — no keepWithNext.`,
          startIndex: el.startIndex,
          endIndex: el.endIndex,
        });
      }
    }

    if (el?.table) {
      if (!tableHasBorder(el)) {
        findings.push({
          rule: "unstyled-table",
          severity: "warn",
          detail: "Table has no cell borders.",
          tableStart: el.startIndex,
          rows: el.table.tableRows?.length ?? 0,
          cols: el.table.tableRows?.[0]?.tableCells?.length ?? 0,
        });
      }
    }

    // Stranded empty paragraph adjacent to a section break → phantom page risk.
    const isEmptyPara = el?.paragraph && paragraphText(el).trim() === "";
    const next = content[i + 1];
    if (isEmptyPara && next?.sectionBreak) {
      findings.push({
        rule: "phantom-empty-paragraph",
        severity: "info",
        detail: "Empty paragraph before a section break — may render a blank page.",
        startIndex: el.startIndex,
        endIndex: el.endIndex,
      });
    }
  });

  return findings;
}

type DocsRequest = Record<string, unknown>;

/** Auto-fix requests for the safe findings: keepWithNext on headings, borders on tables. */
export function buildQcFixRequests(findings: QcFinding[], tabId?: string): DocsRequest[] {
  const range = (s: number, e: number) => (tabId ? { startIndex: s, endIndex: e, tabId } : { startIndex: s, endIndex: e });
  const border = { color: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } }, width: { magnitude: 1, unit: "PT" }, dashStyle: "SOLID" };
  const requests: DocsRequest[] = [];

  for (const f of findings) {
    if (f.rule === "heading-no-keepwithnext" && f.startIndex != null && f.endIndex != null) {
      requests.push({
        updateParagraphStyle: {
          range: range(f.startIndex, f.endIndex),
          paragraphStyle: { keepWithNext: true },
          fields: "keepWithNext",
        },
      });
    }
    if (f.rule === "unstyled-table" && f.tableStart != null && f.rows && f.cols) {
      const start = tabId ? { index: f.tableStart, tabId } : { index: f.tableStart };
      requests.push({
        updateTableCellStyle: {
          tableRange: { tableCellLocation: { tableStartLocation: start, rowIndex: 0, columnIndex: 0 }, rowSpan: f.rows, columnSpan: f.cols },
          tableCellStyle: { borderTop: border, borderBottom: border, borderLeft: border, borderRight: border },
          fields: "borderTop,borderBottom,borderLeft,borderRight",
        },
      });
    }
  }
  return requests;
}
