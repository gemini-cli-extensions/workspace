import { describe, it, expect } from "vitest";

import { deconstruct, detectSurface, type BrailleFragment } from "../deconstruct";

const names = (frags: BrailleFragment[]) => frags.map((f) => `${f.kind}:${f.name}`);

describe("detectSurface", () => {
  it("maps Google mimeTypes to surfaces", () => {
    expect(detectSurface("application/vnd.google-apps.document")).toBe("doc");
    expect(detectSurface("application/vnd.google-apps.presentation")).toBe("slide");
    expect(detectSurface("application/vnd.google-apps.spreadsheet")).toBe("sheet");
    expect(detectSurface("text/html")).toBeNull();
  });
});

describe("deconstruct doc — anchors", () => {
  const para = (text: string) => ({ paragraph: { elements: [{ textRun: { content: text } }] } });
  const raw = {
    body: {
      content: [
        para("Intro paragraph"),
        para("[Component: Hero]"),
        para("hello hero"),
        para("[End Component]"),
        para("Outro"),
      ],
    },
  };

  it("emits a template plus one component per anchor block", () => {
    const frags = deconstruct("doc", raw);
    expect(names(frags)).toEqual(["template:template", "component:Hero"]);
    const hero = frags[1];
    expect(hero.anchor).toBe("Hero");
    // The collected block holds the inner paragraph, not the anchor lines.
    expect((hero.structure as any).content).toHaveLength(1);
  });
});

describe("deconstruct doc — table fallback", () => {
  it("treats each table as a component when no anchors exist", () => {
    const raw = {
      body: {
        content: [
          { paragraph: { elements: [{ textRun: { content: "no anchors here" } }] } },
          { table: { rows: 2, columns: 3 } },
          { table: { rows: 1, columns: 1 } },
        ],
      },
    };
    const frags = deconstruct("doc", raw);
    expect(names(frags)).toEqual(["template:template", "component:table-0", "component:table-1"]);
  });
});

describe("deconstruct doc — tabs", () => {
  it("reads content across tabs when includeTabsContent populated tabs[]", () => {
    const raw = {
      tabs: [
        { documentTab: { body: { content: [{ table: {} }] } } },
        { documentTab: { body: { content: [{ table: {} }] } } },
      ],
    };
    const frags = deconstruct("doc", raw);
    expect(names(frags)).toEqual(["template:template", "component:table-0", "component:table-1"]);
  });
});

describe("deconstruct slides", () => {
  it("emits a component per slide", () => {
    const frags = deconstruct("slide", { slides: [{ objectId: "p1" }, { objectId: "p2" }] });
    expect(names(frags)).toEqual(["template:template", "component:p1", "component:p2"]);
  });
});

describe("deconstruct sheets", () => {
  it("emits a component per tab by title", () => {
    const frags = deconstruct("sheet", {
      sheets: [{ properties: { title: "Q1" } }, { properties: { title: "Q2" } }],
    });
    expect(names(frags)).toEqual(["template:template", "component:Q1", "component:Q2"]);
  });
});
