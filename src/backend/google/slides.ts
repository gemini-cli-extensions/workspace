/**
 * @fileoverview Workers-native Google Slides REST client (NET-NEW).
 *
 * `GoogleSlidesClient` extends {@link GoogleApiClient} and wraps the Slides v1
 * API (`https://slides.googleapis.com/v1/presentations`). There was no legacy
 * Slides implementation; this is implemented directly against the REST API.
 * Template copying reuses the Drive v3 `files/{id}/copy` endpoint followed by a
 * `replaceAllText` batchUpdate (mirroring the Docs template pattern).
 *
 * Every id/url argument is normalized with {@link extractGoogleId}.
 */

import { extractGoogleId } from "@/backend/google/core/ids";
import { GoogleApiClient } from "@/backend/google/core/client";
import { GoogleScope } from "@/backend/lib/google-auth";

const SLIDES_BASE = "https://slides.googleapis.com/v1/presentations";
const DRIVE_BASE = "https://www.googleapis.com/drive/v3";

/** A presentation resource (subset). */
export interface Presentation {
  presentationId: string;
  title?: string;
  revisionId?: string;
  slides?: Array<{ objectId?: string }>;
  pageSize?: { width?: unknown; height?: unknown };
}

/** Generic Slides batchUpdate request object (passed through verbatim). */
export type SlidesRequest = Record<string, unknown>;

/**
 * Account-bound client for the Google Slides API v1.
 *
 * @example
 * ```ts
 * const slides = new GoogleSlidesClient(env, "workspace");
 * const pres = await slides.createPresentation("Q3 Review");
 * await slides.createSlide(pres.presentationId, "TITLE_AND_BODY");
 * ```
 */
export class GoogleSlidesClient extends GoogleApiClient {
  /**
   * Create a new, empty presentation.
   *
   * @param title - Presentation title
   * @returns The created {@link Presentation}
   * @throws If the request fails
   */
  async createPresentation(title: string): Promise<Presentation> {
    return this.request<Presentation>(SLIDES_BASE, {
      method: "POST",
      body: { title },
      scopes: [GoogleScope.Slides],
    });
  }

  /**
   * Read a presentation's structure.
   *
   * @param idInput - Presentation ID or URL
   * @returns The {@link Presentation}
   * @throws If the presentation is missing or access is denied
   */
  async read(idInput: string): Promise<Presentation> {
    const id = extractGoogleId(idInput);
    return this.request<Presentation>(`${SLIDES_BASE}/${id}`, {
      scopes: [GoogleScope.Slides],
    });
  }

  /**
   * Execute an arbitrary array of Slides batchUpdate requests.
   *
   * @param idInput - Presentation ID or URL
   * @param requests - Slides API `Request` objects
   * @returns The batchUpdate response
   * @throws If any request is invalid
   */
  async batchUpdate<T = unknown>(idInput: string, requests: SlidesRequest[]): Promise<T> {
    const id = extractGoogleId(idInput);
    return this.request<T>(`${SLIDES_BASE}/${id}:batchUpdate`, {
      method: "POST",
      body: { requests },
      scopes: [GoogleScope.Slides],
    });
  }

  /**
   * Append a new slide using a predefined layout.
   *
   * @param idInput - Presentation ID or URL
   * @param layout - Predefined layout (default `"BLANK"`)
   * @returns The batchUpdate response (contains the created slide's objectId)
   * @throws If the presentation is missing or access is denied
   */
  async createSlide(
    idInput: string,
    layout:
      | "BLANK"
      | "CAPTION_ONLY"
      | "TITLE"
      | "TITLE_AND_BODY"
      | "TITLE_AND_TWO_COLUMNS"
      | "TITLE_ONLY"
      | "SECTION_HEADER"
      | "SECTION_TITLE_AND_DESCRIPTION"
      | "ONE_COLUMN_TEXT"
      | "MAIN_POINT"
      | "BIG_NUMBER" = "BLANK",
  ): Promise<unknown> {
    return this.batchUpdate(idInput, [
      { createSlide: { slideLayoutReference: { predefinedLayout: layout } } },
    ]);
  }

  /**
   * Insert text into a page element (shape/text box) by its object ID.
   *
   * @param idInput - Presentation ID or URL
   * @param objectId - Target shape/element object ID
   * @param text - Text to insert
   * @param insertionIndex - Index within the element's text (default 0)
   * @returns The batchUpdate response
   * @throws If the element is missing or access is denied
   */
  async insertText(
    idInput: string,
    objectId: string,
    text: string,
    insertionIndex = 0,
  ): Promise<unknown> {
    return this.batchUpdate(idInput, [
      { insertText: { objectId, text, insertionIndex } },
    ]);
  }

  /**
   * Replace every occurrence of a string across the presentation.
   *
   * @param idInput - Presentation ID or URL
   * @param find - Text to search for
   * @param replace - Replacement text
   * @param matchCase - Whether the search is case-sensitive (default `true`)
   * @returns The batchUpdate response
   * @throws If the presentation is missing or access is denied
   */
  async replaceAllText(
    idInput: string,
    find: string,
    replace: string,
    matchCase = true,
  ): Promise<unknown> {
    return this.batchUpdate(idInput, [
      {
        replaceAllText: {
          containsText: { text: find, matchCase },
          replaceText: replace,
        },
      },
    ]);
  }

  /**
   * Create a presentation from a template by copying it (Drive) and then
   * replacing placeholder tokens.
   *
   * @param templateIdInput - Template presentation ID or URL
   * @param replacements - Map of `{placeholder: value}` substitutions
   * @param parentIdInput - Optional destination folder ID or URL
   * @param name - Optional name for the copy
   * @returns The new presentation `{ presentationId, name, webViewLink }`
   * @throws If the template is missing or access is denied
   * @example
   * ```ts
   * await slides.createFromTemplate("<tmplId>", { "{{name}}": "Ada" });
   * ```
   */
  async createFromTemplate(
    templateIdInput: string,
    replacements: Record<string, string>,
    parentIdInput?: string,
    name = `Presentation ${new Date().toISOString()}`,
  ): Promise<{ presentationId: string; name: string; webViewLink?: string }> {
    const templateId = extractGoogleId(templateIdInput);
    const parentId = parentIdInput ? extractGoogleId(parentIdInput) : undefined;

    const copied = await this.request<{ id: string; name: string; webViewLink?: string }>(
      `${DRIVE_BASE}/files/${templateId}/copy`,
      {
        method: "POST",
        query: { fields: "id,name,webViewLink" },
        body: { name, parents: parentId ? [parentId] : undefined },
        scopes: [GoogleScope.Drive],
      },
    );

    const requests = Object.entries(replacements).map(([find, replace]) => ({
      replaceAllText: {
        containsText: { text: find, matchCase: true },
        replaceText: replace,
      },
    }));
    if (requests.length > 0) {
      await this.batchUpdate(copied.id, requests);
    }

    return { presentationId: copied.id, name: copied.name, webViewLink: copied.webViewLink };
  }

  /**
   * Add an image from a public URL to a page.
   *
   * @param idInput - Presentation ID or URL
   * @param pageObjectId - Target page (slide) object ID
   * @param url - Public image URL
   * @returns The batchUpdate response (contains the created image objectId)
   * @throws If `url` is invalid or the page is missing
   */
  async addImage(idInput: string, pageObjectId: string, url: string): Promise<unknown> {
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid image URL format: ${url}`);
    }
    return this.batchUpdate(idInput, [
      {
        createImage: {
          url,
          elementProperties: { pageObjectId },
        },
      },
    ]);
  }
}
