import { describe, it, expect, vi, afterEach } from "vitest";
import { SlidesService, parseMarkdownSlides } from "../slides";
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("SlidesService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("create posts title to presentations", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ presentationId: "p1", title: "Deck" }), { status: 200 }),
    );
    const out = await new SlidesService({} as any, "s1").create("Deck");
    expect(out.presentationId).toBe("p1");
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://slides.googleapis.com/v1/presentations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Deck" });
  });

  it("get fetches presentation by id", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ presentationId: "p1", title: "Deck", slides: [] }), { status: 200 }),
    );
    const out = await new SlidesService({} as any, "s1").get("p1");
    expect(out.presentationId).toBe("p1");
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("https://slides.googleapis.com/v1/presentations/p1");
  });

  it("batchUpdate posts requests to :batchUpdate", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const requests = [{ createSlide: {} }];
    await new SlidesService({} as any, "s1").batchUpdate("p1", requests);
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://slides.googleapis.com/v1/presentations/p1:batchUpdate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ requests });
  });

  it("parseMarkdownSlides splits on --- and extracts heading/bullets/image", () => {
    const md = "# A\n- one\n- two\n---\n## B\n![x](http://img)";
    const slides = parseMarkdownSlides(md);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toEqual({ heading: "A", bullets: ["one", "two"], imageUrl: undefined });
    expect(slides[1]).toEqual({ heading: "B", bullets: [], imageUrl: "http://img" });
  });

  it("createFromMarkdown deletes the default slide and builds slides with known objectIds", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u === "https://slides.googleapis.com/v1/presentations") {
        return new Response(JSON.stringify({ presentationId: "p1" }), { status: 200 });
      }
      if (u === "https://slides.googleapis.com/v1/presentations/p1") {
        return new Response(JSON.stringify({ presentationId: "p1", slides: [{ objectId: "default0" }] }), {
          status: 200,
        });
      }
      if (u === "https://slides.googleapis.com/v1/presentations/p1:batchUpdate") {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      throw new Error(`unexpected url ${u}`);
    });

    const md = "# A\n- one\n---\n## B\n- two\n![x](http://img)";
    const out = await new SlidesService({} as any, "s1").createFromMarkdown("Deck", md);

    expect(out.presentationId).toBe("p1");
    expect(out.slides).toEqual([
      { slideObjectId: "s0", titleId: "s0_title", bodyId: "s0_body", imageId: undefined, heading: "A" },
      { slideObjectId: "s1", titleId: "s1_title", bodyId: "s1_body", imageId: "s1_img", heading: "B" },
    ]);

    const batchCall = fetchSpy.mock.calls.find(
      (c) => String(c[0]) === "https://slides.googleapis.com/v1/presentations/p1:batchUpdate",
    );
    expect(batchCall).toBeDefined();
    const requests = JSON.parse((batchCall![1] as RequestInit).body as string).requests;

    expect(requests[0]).toEqual({ deleteObject: { objectId: "default0" } });

    expect(requests).toContainEqual({
      createSlide: {
        objectId: "s0",
        slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
        placeholderIdMappings: [
          { layoutPlaceholder: { type: "TITLE", index: 0 }, objectId: "s0_title" },
          { layoutPlaceholder: { type: "BODY", index: 0 }, objectId: "s0_body" },
        ],
      },
    });
    expect(requests).toContainEqual({ insertText: { objectId: "s0_title", text: "A" } });
    expect(requests).toContainEqual({ insertText: { objectId: "s0_body", text: "one" } });

    const s0SlideIdx = requests.findIndex((r: any) => r.createSlide?.objectId === "s0");
    const s0TitleIdx = requests.findIndex((r: any) => r.insertText?.objectId === "s0_title");
    expect(s0SlideIdx).toBeLessThan(s0TitleIdx);

    expect(requests).toContainEqual({
      createImage: {
        objectId: "s1_img",
        url: "http://img",
        elementProperties: {
          pageObjectId: "s1",
          size: { width: { magnitude: 3000000, unit: "EMU" }, height: { magnitude: 2000000, unit: "EMU" } },
          transform: { scaleX: 1, scaleY: 1, translateX: 4000000, translateY: 2500000, unit: "EMU" },
        },
      },
    });
  });

  it("replaceAllText posts a replaceAllText request per replacement", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new SlidesService({} as any, "s1").replaceAllText("p1", [
      { find: "{{name}}", replace: "Justin" },
      { find: "{{Date}}", replace: "2026", matchCase: true },
    ]);
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://slides.googleapis.com/v1/presentations/p1:batchUpdate");
    expect(JSON.parse(init.body as string).requests).toEqual([
      { replaceAllText: { containsText: { text: "{{name}}", matchCase: false }, replaceText: "Justin" } },
      { replaceAllText: { containsText: { text: "{{Date}}", matchCase: true }, replaceText: "2026" } },
    ]);
  });

  it("getThumbnail fetches the page thumbnail endpoint", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ contentUrl: "http://thumb", width: 200, height: 150 }), { status: 200 }),
    );
    const out = await new SlidesService({} as any, "s1").getThumbnail("p1", "s0");
    expect(out.contentUrl).toBe("http://thumb");
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("https://slides.googleapis.com/v1/presentations/p1/pages/s0/thumbnail");
  });

  it("styleText emits an updateTextStyle request over the whole text range with a matching fields mask", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new SlidesService({} as any, "s1").styleText("p1", "box1", {
      bold: true,
      italic: false,
      underline: true,
      fontSize: 24,
      fontFamily: "Arial",
      foregroundColorHex: "#FF0000",
      link: "http://example.com",
    });
    const init = spy.mock.calls[0][1] as RequestInit;
    const requests = JSON.parse(init.body as string).requests;
    expect(requests).toEqual([
      {
        updateTextStyle: {
          objectId: "box1",
          textRange: { type: "ALL" },
          style: {
            bold: true,
            italic: false,
            underline: true,
            fontSize: { magnitude: 24, unit: "PT" },
            fontFamily: "Arial",
            foregroundColor: { opaqueColor: { rgbColor: { red: 1, green: 0, blue: 0 } } },
            link: { url: "http://example.com" },
          },
          fields: "bold,italic,underline,fontSize,fontFamily,foregroundColor,link",
        },
      },
    ]);
  });

  it("styleText only sets fields that were provided", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new SlidesService({} as any, "s1").styleText("p1", "box1", { bold: true });
    const init = spy.mock.calls[0][1] as RequestInit;
    const requests = JSON.parse(init.body as string).requests;
    expect(requests).toEqual([
      {
        updateTextStyle: {
          objectId: "box1",
          textRange: { type: "ALL" },
          style: { bold: true },
          fields: "bold",
        },
      },
    ]);
  });

  it("styleShape emits an updateShapeProperties request for background + outline color", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new SlidesService({} as any, "s1").styleShape("p1", "shape1", {
      backgroundColorHex: "#00FF00",
      outlineColorHex: "#0000FF",
    });
    const init = spy.mock.calls[0][1] as RequestInit;
    const requests = JSON.parse(init.body as string).requests;
    expect(requests).toEqual([
      {
        updateShapeProperties: {
          objectId: "shape1",
          shapeProperties: {
            shapeBackgroundFill: { solidFill: { color: { rgbColor: { red: 0, green: 1, blue: 0 } } } },
            outline: { outlineFill: { solidFill: { color: { rgbColor: { red: 0, green: 0, blue: 1 } } } } },
          },
          fields: "shapeBackgroundFill.solidFill.color,outline.outlineFill.solidFill.color",
        },
      },
    ]);
  });

  it("setSlideBackground emits an updatePageProperties request with a solid color fill", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new SlidesService({} as any, "s1").setSlideBackground("p1", "s0", "#123456");
    const init = spy.mock.calls[0][1] as RequestInit;
    const requests = JSON.parse(init.body as string).requests;
    expect(requests).toEqual([
      {
        updatePageProperties: {
          objectId: "s0",
          pageProperties: {
            pageBackgroundFill: {
              solidFill: {
                color: {
                  rgbColor: {
                    red: 0x12 / 255,
                    green: 0x34 / 255,
                    blue: 0x56 / 255,
                  },
                },
              },
            },
          },
          fields: "pageBackgroundFill.solidFill.color",
        },
      },
    ]);
  });
});
