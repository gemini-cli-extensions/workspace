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

export class SlidesService {
  constructor(private env: Env, private sub: string) {}

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
}
