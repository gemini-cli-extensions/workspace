import { describe, it, expect } from "vitest";

import { tokenizeCode, buildCodeTextRequests } from "../code-format";
import { findLastTable } from "../locate";
import { buildFillRequests, buildTableStyleRequests } from "../table-format";

describe("tokenizeCode", () => {
  it("tags SQL keywords, comments, strings without overlap", () => {
    const toks = tokenizeCode("SELECT * FROM t -- note\nWHERE a='x'", "sql");
    const kinds = toks.map((t) => t.type);
    expect(kinds).toContain("keyword");
    expect(kinds).toContain("comment");
    expect(kinds).toContain("string");
    // comment must swallow the trailing text, not be re-tokenized as keywords
    const comment = toks.find((t) => t.type === "comment")!;
    const inside = toks.filter((t) => t.start > comment.start && t.start < comment.end);
    expect(inside).toHaveLength(0);
  });
});

describe("buildCodeTextRequests", () => {
  it("inserts text then styles token ranges offset by the cell index", () => {
    const reqs = buildCodeTextRequests(5, "const x", "javascript", "dracula");
    expect((reqs[0] as any).insertText.location.index).toBe(5);
    expect((reqs[0] as any).insertText.text).toBe("const x");
    // a keyword token ("const") should be styled within [5, 10)
    const kw = reqs.find((r: any) => r.updateTextStyle?.textStyle?.bold);
    expect((kw as any).updateTextStyle.range.startIndex).toBe(5);
    expect((kw as any).updateTextStyle.range.endIndex).toBe(10);
  });
});

describe("findLastTable", () => {
  it("locates cell paragraph indices in a raw doc", () => {
    const raw = {
      body: {
        content: [
          { paragraph: {} },
          {
            startIndex: 10,
            table: {
              tableRows: [
                { tableCells: [{ content: [{ startIndex: 12 }] }, { content: [{ startIndex: 15 }] }] },
                { tableCells: [{ content: [{ startIndex: 20 }] }, { content: [{ startIndex: 24 }] }] },
              ],
            },
          },
        ],
      },
    };
    const t = findLastTable(raw)!;
    expect(t.tableStartIndex).toBe(10);
    expect(t.rows).toBe(2);
    expect(t.cols).toBe(2);
    expect(t.cells).toHaveLength(4);
  });
});

describe("table request builders", () => {
  const located = {
    tableStartIndex: 10,
    rows: 2,
    cols: 2,
    cells: [
      { rowIndex: 0, colIndex: 0, startIndex: 12 },
      { rowIndex: 0, colIndex: 1, startIndex: 15 },
      { rowIndex: 1, colIndex: 0, startIndex: 20 },
      { rowIndex: 1, colIndex: 1, startIndex: 24 },
    ],
  };
  const data = [["H1", "H2"], ["a", "b"]];

  it("fills highest-index-first so earlier inserts don't shift later cells", () => {
    const fills = buildFillRequests(located, data).map((r: any) => r.insertText.location.index);
    expect(fills).toEqual([24, 20, 15, 12]);
  });

  it("styles borders + header fill + header text", () => {
    const reqs = buildTableStyleRequests(located, data, "default");
    const hasBorder = reqs.some((r: any) => r.updateTableCellStyle?.tableCellStyle?.borderTop);
    const hasHeaderBg = reqs.some((r: any) => r.updateTableCellStyle?.tableCellStyle?.backgroundColor);
    const hasWhiteBold = reqs.some((r: any) => r.updateTextStyle?.textStyle?.bold);
    const hasCenter = reqs.some((r: any) => r.updateParagraphStyle?.paragraphStyle?.alignment === "CENTER");
    expect(hasBorder && hasHeaderBg && hasWhiteBold && hasCenter).toBe(true);
  });
});
