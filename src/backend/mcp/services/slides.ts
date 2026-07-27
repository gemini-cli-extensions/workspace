import { googleJson } from "../googleClient";

const BASE = "https://slides.googleapis.com/v1/presentations";

export interface ParsedSlide {
  heading: string;
  bullets: string[];
  imageUrl?: string;
}

export interface SlideRef {
  slideObjectId: string;
  titleId: string;
  bodyId: string;
  imageId?: string;
  heading: string;
}

/** Pure markdown -> slide-content parser. Exported for unit testing. */
export function parseMarkdownSlides(markdown: string): ParsedSlide[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[][] = [[]];
  for (const line of lines) {
    if (line.trim() === "---") {
      blocks.push([]);
    } else {
      blocks[blocks.length - 1].push(line);
    }
  }

  const slides: ParsedSlide[] = [];
  for (const block of blocks) {
    let heading = "";
    const bullets: string[] = [];
    let imageUrl: string | undefined;

    for (const raw of block) {
      const line = raw.trim();
      if (!line) continue;

      const headingMatch = line.match(/^#{1,2}\s+(.*)$/);
      if (headingMatch && !heading) {
        heading = headingMatch[1].trim();
        continue;
      }

      const imageMatch = line.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
      if (imageMatch) {
        imageUrl = imageMatch[1];
        continue;
      }

      const bulletMatch = line.match(/^[-*]\s+(.*)$/);
      bullets.push(bulletMatch ? bulletMatch[1].trim() : line);
    }

    if (heading || bullets.length > 0 || imageUrl) {
      slides.push({ heading, bullets, imageUrl });
    }
  }

  return slides;
}

export interface TextStyleInput {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
  fontFamily?: string;
  foregroundColorHex?: string;
  link?: string;
}

export interface ShapeStyleInput {
  backgroundColorHex?: string;
  outlineColorHex?: string;
}

export class SlidesService {
  constructor(private env: Env, private sub: string) {}

  /** "#RRGGBB" (or "RRGGBB") -> Slides API rgbColor (0..1 floats). */
  private hexToRgb(hex: string): { red: number; green: number; blue: number } {
    const clean = hex.replace(/^#/, "");
    const red = parseInt(clean.slice(0, 2), 16) / 255;
    const green = parseInt(clean.slice(2, 4), 16) / 255;
    const blue = parseInt(clean.slice(4, 6), 16) / 255;
    return { red, green, blue };
  }

  async create(title: string): Promise<{ presentationId: string; title?: string }> {
    return googleJson<{ presentationId: string; title?: string }>(this.env, this.sub, BASE, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }

  async get(presentationId: string): Promise<{ presentationId: string; title?: string; slides?: unknown[] }> {
    return googleJson<{ presentationId: string; title?: string; slides?: unknown[] }>(
      this.env,
      this.sub,
      `${BASE}/${presentationId}`,
    );
  }

  async batchUpdate(presentationId: string, requests: unknown[]): Promise<unknown> {
    return googleJson(this.env, this.sub, `${BASE}/${presentationId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }

  /**
   * Build a deck from Markdown, giving every created slide/title/body/image a
   * deterministic objectId ("s0", "s0_title", "s0_body", "s0_img", ...) so a
   * follow-up agent can batchUpdate specific elements without re-fetching and
   * guessing IDs.
   */
  async createFromMarkdown(
    title: string,
    markdown: string,
  ): Promise<{ presentationId: string; slides: SlideRef[] }> {
    const created = await this.create(title);
    const presentationId = created.presentationId;

    const presentation = await this.get(presentationId);
    const defaultSlideId = (presentation.slides?.[0] as { objectId?: string } | undefined)?.objectId;

    const parsed = parseMarkdownSlides(markdown);
    const requests: unknown[] = [];

    if (defaultSlideId) {
      requests.push({ deleteObject: { objectId: defaultSlideId } });
    }

    const slideRefs: SlideRef[] = parsed.map((slide, i) => {
      const slideObjectId = `s${i}`;
      const titleId = `${slideObjectId}_title`;
      const bodyId = `${slideObjectId}_body`;
      const imageId = slide.imageUrl ? `${slideObjectId}_img` : undefined;

      requests.push({
        createSlide: {
          objectId: slideObjectId,
          slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
          placeholderIdMappings: [
            { layoutPlaceholder: { type: "TITLE", index: 0 }, objectId: titleId },
            { layoutPlaceholder: { type: "BODY", index: 0 }, objectId: bodyId },
          ],
        },
      });

      requests.push({ insertText: { objectId: titleId, text: slide.heading } });

      if (slide.bullets.length > 0) {
        requests.push({ insertText: { objectId: bodyId, text: slide.bullets.join("\n") } });
        requests.push({
          createParagraphBullets: {
            objectId: bodyId,
            textRange: { type: "ALL" },
            bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
          },
        });
      }

      if (imageId) {
        requests.push({
          createImage: {
            objectId: imageId,
            url: slide.imageUrl,
            elementProperties: {
              pageObjectId: slideObjectId,
              size: { width: { magnitude: 3000000, unit: "EMU" }, height: { magnitude: 2000000, unit: "EMU" } },
              transform: { scaleX: 1, scaleY: 1, translateX: 4000000, translateY: 2500000, unit: "EMU" },
            },
          },
        });
      }

      return { slideObjectId, titleId, bodyId, imageId, heading: slide.heading };
    });

    await this.batchUpdate(presentationId, requests);

    return { presentationId, slides: slideRefs };
  }

  /** Find-and-replace across the whole deck, e.g. to fill placeholder tokens after a markdown build. */
  async replaceAllText(
    presentationId: string,
    replacements: { find: string; replace: string; matchCase?: boolean }[],
  ): Promise<unknown> {
    const requests = replacements.map((r) => ({
      replaceAllText: {
        containsText: { text: r.find, matchCase: r.matchCase ?? false },
        replaceText: r.replace,
      },
    }));
    return this.batchUpdate(presentationId, requests);
  }

  /** Render a single page as an image so an agent can see a slide before styling it. */
  async getThumbnail(
    presentationId: string,
    pageObjectId: string,
  ): Promise<{ contentUrl: string; width?: number; height?: number }> {
    return googleJson<{ contentUrl: string; width?: number; height?: number }>(
      this.env,
      this.sub,
      `${BASE}/${presentationId}/pages/${pageObjectId}/thumbnail`,
    );
  }

  /** Style all text in a text box/shape (bold/italic/underline/font/color/link) without hand-written batchUpdate JSON. */
  async styleText(presentationId: string, objectId: string, style: TextStyleInput): Promise<unknown> {
    const fields: string[] = [];
    const textStyle: Record<string, unknown> = {};

    if (style.bold !== undefined) {
      textStyle.bold = style.bold;
      fields.push("bold");
    }
    if (style.italic !== undefined) {
      textStyle.italic = style.italic;
      fields.push("italic");
    }
    if (style.underline !== undefined) {
      textStyle.underline = style.underline;
      fields.push("underline");
    }
    if (style.fontSize !== undefined) {
      textStyle.fontSize = { magnitude: style.fontSize, unit: "PT" };
      fields.push("fontSize");
    }
    if (style.fontFamily !== undefined) {
      textStyle.fontFamily = style.fontFamily;
      fields.push("fontFamily");
    }
    if (style.foregroundColorHex !== undefined) {
      textStyle.foregroundColor = { opaqueColor: { rgbColor: this.hexToRgb(style.foregroundColorHex) } };
      fields.push("foregroundColor");
    }
    if (style.link !== undefined) {
      textStyle.link = { url: style.link };
      fields.push("link");
    }

    return this.batchUpdate(presentationId, [
      {
        updateTextStyle: {
          objectId,
          textRange: { type: "ALL" },
          style: textStyle,
          fields: fields.join(","),
        },
      },
    ]);
  }

  /** Style a shape's fill/outline color without hand-written batchUpdate JSON. */
  async styleShape(presentationId: string, objectId: string, props: ShapeStyleInput): Promise<unknown> {
    const fields: string[] = [];
    const shapeProperties: Record<string, unknown> = {};

    if (props.backgroundColorHex !== undefined) {
      shapeProperties.shapeBackgroundFill = {
        solidFill: { color: { rgbColor: this.hexToRgb(props.backgroundColorHex) } },
      };
      fields.push("shapeBackgroundFill.solidFill.color");
    }
    if (props.outlineColorHex !== undefined) {
      shapeProperties.outline = {
        outlineFill: { solidFill: { color: { rgbColor: this.hexToRgb(props.outlineColorHex) } } },
      };
      fields.push("outline.outlineFill.solidFill.color");
    }

    return this.batchUpdate(presentationId, [
      {
        updateShapeProperties: {
          objectId,
          shapeProperties,
          fields: fields.join(","),
        },
      },
    ]);
  }

  /** Set a slide's background to a solid color without hand-written batchUpdate JSON. */
  async setSlideBackground(presentationId: string, pageObjectId: string, colorHex: string): Promise<unknown> {
    return this.batchUpdate(presentationId, [
      {
        updatePageProperties: {
          objectId: pageObjectId,
          pageProperties: {
            pageBackgroundFill: { solidFill: { color: { rgbColor: this.hexToRgb(colorHex) } } },
          },
          fields: "pageBackgroundFill.solidFill.color",
        },
      },
    ]);
  }
}
