import { describe, it, expect } from "vitest";

import { analyzePages, collectHeadings } from "../render-qc";

describe("collectHeadings", () => {
  it("pulls heading paragraph text", () => {
    const raw = {
      body: {
        content: [
          { paragraph: { paragraphStyle: { namedStyleType: "HEADING_1" }, elements: [{ textRun: { content: "Intro" } }] } },
          { paragraph: { paragraphStyle: { namedStyleType: "NORMAL_TEXT" }, elements: [{ textRun: { content: "body" } }] } },
        ],
      },
    };
    expect(collectHeadings(raw)).toEqual(["Intro"]);
  });
});

describe("analyzePages", () => {
  it("flags a heading stranded at a page bottom", () => {
    const pages = ["some body text\nMore text\nResults", "Results details continue here"];
    const findings = analyzePages(pages, ["Results"]);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("orphan-heading");
    expect(findings[0].page).toBe(1);
  });

  it("does not flag a heading that isn't at a page boundary", () => {
    const pages = ["Results\nbody continues on same page", "next page"];
    expect(analyzePages(pages, ["Results"])).toHaveLength(0);
  });

  it("ignores the last page (nothing after it to orphan onto)", () => {
    expect(analyzePages(["a\nResults"], ["Results"])).toHaveLength(0);
  });
});
