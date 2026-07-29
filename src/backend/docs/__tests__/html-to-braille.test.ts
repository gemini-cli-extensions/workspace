import { describe, it, expect } from "vitest";

import { htmlToRequests } from "../html-to-braille";

describe("htmlToRequests", () => {
  it("emits one insertText with concatenated block text", () => {
    const reqs = htmlToRequests("<h1>Title</h1><p>Hello <b>world</b></p>");
    const insert = reqs[0] as any;
    expect(insert.insertText.location.index).toBe(1);
    expect(insert.insertText.text).toBe("Title\nHello world\n");
  });

  it("styles headings via namedStyleType", () => {
    const reqs = htmlToRequests("<h2>Sec</h2>");
    const h = reqs.find((r: any) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === "HEADING_2");
    expect((h as any).updateParagraphStyle.range.startIndex).toBe(1);
  });

  it("styles inline bold at the correct resolved range", () => {
    // "Hello world\n" — "world" spans offsets 6..11 within the paragraph starting at index 1
    const reqs = htmlToRequests("<p>Hello <b>world</b></p>");
    const bold = reqs.find((r: any) => r.updateTextStyle?.textStyle?.bold) as any;
    expect(bold.updateTextStyle.range.startIndex).toBe(1 + 6);
    expect(bold.updateTextStyle.range.endIndex).toBe(1 + 11);
  });

  it("bullets list items", () => {
    const reqs = htmlToRequests("<ul><li>a</li><li>b</li></ul>");
    const bullets = reqs.filter((r: any) => r.createParagraphBullets);
    expect(bullets.length).toBe(2);
  });

  it("returns nothing for empty html", () => {
    expect(htmlToRequests("<div></div>")).toEqual([]);
  });
});
