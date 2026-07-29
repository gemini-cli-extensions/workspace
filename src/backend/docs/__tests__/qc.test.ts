import { describe, it, expect } from "vitest";

import { lintDoc, buildQcFixRequests } from "../qc";

const heading = (text: string, keep = false, startIndex = 1, endIndex = 10) => ({
  startIndex,
  endIndex,
  paragraph: {
    paragraphStyle: { namedStyleType: "HEADING_2", ...(keep ? { keepWithNext: true } : {}) },
    elements: [{ textRun: { content: text } }],
  },
});

describe("lintDoc", () => {
  it("flags headings without keepWithNext, passes those with it", () => {
    const raw = { body: { content: [heading("Bad"), heading("Good", true, 12, 20)] } };
    const findings = lintDoc(raw);
    expect(findings.filter((f) => f.rule === "heading-no-keepwithnext")).toHaveLength(1);
  });

  it("flags a table with no borders", () => {
    const raw = {
      body: {
        content: [{ startIndex: 30, table: { tableRows: [{ tableCells: [{}, {}] }, { tableCells: [{}, {}] }] } }],
      },
    };
    const f = lintDoc(raw).find((x) => x.rule === "unstyled-table")!;
    expect(f.rows).toBe(2);
    expect(f.cols).toBe(2);
  });

  it("passes a table that already has borders", () => {
    const raw = {
      body: {
        content: [
          { startIndex: 30, table: { tableRows: [{ tableCells: [{ tableCellStyle: { borderTop: { width: { magnitude: 1 } } } }] }] } },
        ],
      },
    };
    expect(lintDoc(raw).some((f) => f.rule === "unstyled-table")).toBe(false);
  });

  it("flags an empty paragraph before a section break", () => {
    const raw = {
      body: {
        content: [
          { startIndex: 5, endIndex: 6, paragraph: { elements: [{ textRun: { content: "\n" } }] } },
          { sectionBreak: {} },
        ],
      },
    };
    expect(lintDoc(raw).some((f) => f.rule === "phantom-empty-paragraph")).toBe(true);
  });
});

describe("buildQcFixRequests", () => {
  it("emits keepWithNext + table border fixes", () => {
    const findings = lintDoc({
      body: {
        content: [heading("Bad"), { startIndex: 30, table: { tableRows: [{ tableCells: [{}, {}] }] } }],
      },
    });
    const reqs = buildQcFixRequests(findings);
    const keep = reqs.some((r: any) => r.updateParagraphStyle?.paragraphStyle?.keepWithNext === true);
    const border = reqs.some((r: any) => r.updateTableCellStyle?.tableCellStyle?.borderTop);
    expect(keep && border).toBe(true);
  });
});
