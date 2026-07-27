/**
 * @fileoverview Workers-native Google Docs REST client.
 *
 * `GoogleDocsClient` extends {@link GoogleApiClient} and wraps the Google Docs
 * API v1 (`https://docs.googleapis.com/v1`) plus the Drive v3 comments
 * sub-resource (`https://www.googleapis.com/drive/v3/files/{id}/comments`) used
 * for document comments/replies. It ports the behavior of the legacy
 * `googleDocsApiHelpers.ts` (text find/replace, style requests, tables, image
 * insertion, tab listing) onto pure `fetch` — no Node `googleapis`.
 *
 * Every id/url argument is normalized with {@link extractGoogleId}, and reads
 * can be returned as Markdown via {@link convertDocsJsonToMarkdown}.
 */

import { extractGoogleId } from "@/backend/google/core/ids";
import { GoogleApiClient } from "@/backend/google/core/client";
import { convertDocsJsonToMarkdown } from "@/backend/google/core/markdown";
import { GoogleScope } from "@/backend/lib/google-auth";

const DOCS_BASE = "https://docs.googleapis.com/v1";
const DRIVE_BASE = "https://www.googleapis.com/drive/v3";

/** Character-level text styling options (hex colors as `#RRGGBB`). */
export interface TextStyleArgs {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  fontFamily?: string;
  foregroundColor?: string;
  backgroundColor?: string;
  linkUrl?: string;
}

/** Paragraph-level styling options. */
export interface ParagraphStyleArgs {
  alignment?: "START" | "END" | "CENTER" | "JUSTIFIED";
  indentStart?: number;
  indentEnd?: number;
  spaceAbove?: number;
  spaceBelow?: number;
  namedStyleType?:
    | "NORMAL_TEXT"
    | "TITLE"
    | "SUBTITLE"
    | "HEADING_1"
    | "HEADING_2"
    | "HEADING_3"
    | "HEADING_4"
    | "HEADING_5"
    | "HEADING_6";
  keepWithNext?: boolean;
}

/** A Drive comment as returned by the Drive v3 comments endpoint. */
export interface DriveComment {
  id: string;
  content: string;
  anchor?: string;
  createdTime?: string;
  resolved?: boolean;
  replies?: DriveReply[];
}

/** A reply on a Drive comment. */
export interface DriveReply {
  id: string;
  content: string;
  createdTime?: string;
  action?: string;
}

/** A flattened document tab with its nesting level. */
export interface TabWithLevel {
  tabId: string;
  title: string;
  level: number;
}

/** Generic Docs batchUpdate request object (passed through verbatim). */
export type DocsRequest = Record<string, unknown>;

/**
 * Account-bound client for the Google Docs API v1.
 *
 * @example
 * ```ts
 * const docs = new GoogleDocsClient(env, "workspace");
 * const md = await docs.read("https://docs.google.com/document/d/<ID>/edit");
 * await docs.append("<ID>", "\nAppended line.");
 * ```
 */
export class GoogleDocsClient extends GoogleApiClient {
  /**
   * Read a document and return its text content rendered as Markdown.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @returns The document body converted to Markdown
   * @throws If the document is missing or access is denied
   * @example
   * ```ts
   * const md = await docs.read("<docId>");
   * ```
   */
  async read(docIdInput: string): Promise<string> {
    const raw = await this.getRaw(docIdInput);
    return convertDocsJsonToMarkdown(raw);
  }

  /**
   * Fetch the raw Docs API JSON for a document.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @returns The raw `documents.get` response
   * @throws If the document is missing or access is denied
   */
  async getRaw<T = unknown>(docIdInput: string): Promise<T> {
    const docId = extractGoogleId(docIdInput);
    return this.request<T>(`${DOCS_BASE}/documents/${docId}`, {
      scopes: [GoogleScope.Docs],
    });
  }

  /**
   * Append plain text to the end of a document body.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param text - Text to append
   * @returns The batchUpdate response
   * @throws If the document is missing or the request is invalid
   * @example
   * ```ts
   * await docs.append("<docId>", "\nNew paragraph.");
   * ```
   */
  async append(docIdInput: string, text: string): Promise<unknown> {
    const docId = extractGoogleId(docIdInput);
    const doc = await this.request<{
      body: { content: Array<{ endIndex?: number }> };
    }>(`${DOCS_BASE}/documents/${docId}`, {
      query: { fields: "body/content/endIndex" },
      scopes: [GoogleScope.Docs],
    });
    const endIndex = Math.max(1, (doc.body.content.at(-1)?.endIndex ?? 1) - 1);
    return this.batchUpdate(docId, [
      { insertText: { location: { index: endIndex }, text } },
    ]);
  }

  /**
   * Insert text at a specific (1-based) index in the document.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param index - Insertion index (1-based)
   * @param text - Text to insert
   * @returns The batchUpdate response
   * @throws If the index or document is invalid
   */
  async insertText(docIdInput: string, index: number, text: string): Promise<unknown> {
    if (!text) return {};
    return this.batchUpdate(docIdInput, [
      { insertText: { location: { index }, text } },
    ]);
  }

  /**
   * Execute an arbitrary array of Docs batchUpdate requests.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param requests - Docs API `Request` objects
   * @returns The batchUpdate response
   * @throws If any request is invalid
   * @example
   * ```ts
   * await docs.batchUpdate("<docId>", [{ insertText: { location: { index: 1 }, text: "Hi" } }]);
   * ```
   */
  async batchUpdate<T = unknown>(docIdInput: string, requests: DocsRequest[]): Promise<T> {
    const docId = extractGoogleId(docIdInput);
    if (!requests || requests.length === 0) return {} as T;
    return this.request<T>(`${DOCS_BASE}/documents/${docId}:batchUpdate`, {
      method: "POST",
      body: { requests },
      scopes: [GoogleScope.Docs],
    });
  }

  /**
   * Apply character-level text styling to an index range.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param startIndex - Range start (inclusive)
   * @param endIndex - Range end (exclusive)
   * @param style - Text style options
   * @returns The batchUpdate response, or `{}` if no styles were supplied
   * @throws On invalid color formats or an invalid range
   */
  async applyTextStyle(
    docIdInput: string,
    startIndex: number,
    endIndex: number,
    style: TextStyleArgs,
  ): Promise<unknown> {
    const built = buildUpdateTextStyleRequest(startIndex, endIndex, style);
    if (!built) return {};
    return this.batchUpdate(docIdInput, [built]);
  }

  /**
   * Apply paragraph-level styling to an index range.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param startIndex - Range start (inclusive)
   * @param endIndex - Range end (exclusive)
   * @param style - Paragraph style options
   * @returns The batchUpdate response, or `{}` if no styles were supplied
   * @throws On an invalid range
   */
  async applyParagraphStyle(
    docIdInput: string,
    startIndex: number,
    endIndex: number,
    style: ParagraphStyleArgs,
  ): Promise<unknown> {
    const built = buildUpdateParagraphStyleRequest(startIndex, endIndex, style);
    if (!built) return {};
    return this.batchUpdate(docIdInput, [built]);
  }

  /**
   * Replace every occurrence of a string in the document.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param find - Text to search for
   * @param replace - Replacement text
   * @param matchCase - Whether the search is case-sensitive (default `true`)
   * @returns The batchUpdate response
   * @throws If the document is missing or access is denied
   */
  async replaceAllText(
    docIdInput: string,
    find: string,
    replace: string,
    matchCase = true,
  ): Promise<unknown> {
    return this.batchUpdate(docIdInput, [
      {
        replaceAllText: {
          containsText: { text: find, matchCase },
          replaceText: replace,
        },
      },
    ]);
  }

  /**
   * Insert an empty table at a document index.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param rows - Number of rows (>= 1)
   * @param columns - Number of columns (>= 1)
   * @param index - Insertion index (1-based)
   * @returns The batchUpdate response
   * @throws If `rows`/`columns` are below 1
   */
  async insertTable(
    docIdInput: string,
    rows: number,
    columns: number,
    index: number,
  ): Promise<unknown> {
    if (rows < 1 || columns < 1) {
      throw new Error("Table must have at least 1 row and 1 column.");
    }
    return this.batchUpdate(docIdInput, [
      { insertTable: { location: { index }, rows, columns } },
    ]);
  }

  /**
   * Insert an inline image from a publicly accessible URL.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param imageUrl - Public image URL
   * @param index - Insertion index (1-based)
   * @param width - Optional width in points
   * @param height - Optional height in points
   * @returns The batchUpdate response
   * @throws If `imageUrl` is not a valid URL
   */
  async insertImageFromUrl(
    docIdInput: string,
    imageUrl: string,
    index: number,
    width?: number,
    height?: number,
  ): Promise<unknown> {
    try {
      new URL(imageUrl);
    } catch {
      throw new Error(`Invalid image URL format: ${imageUrl}`);
    }
    const request: DocsRequest = {
      insertInlineImage: {
        location: { index },
        uri: imageUrl,
        ...(width && height
          ? {
              objectSize: {
                height: { magnitude: height, unit: "PT" },
                width: { magnitude: width, unit: "PT" },
              },
            }
          : {}),
      },
    };
    return this.batchUpdate(docIdInput, [request]);
  }

  /**
   * Find the index range of a specific instance of text in the document.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param textToFind - Exact text to locate
   * @param instance - Which occurrence (1-based, default 1)
   * @returns The `{ startIndex, endIndex }` range, or `null` if not found
   * @throws If the document is missing or access is denied
   */
  async findElement(
    docIdInput: string,
    textToFind: string,
    instance = 1,
  ): Promise<{ startIndex: number; endIndex: number } | null> {
    const doc = await this.getRaw<{
      body?: { content?: DocsContentElement[] };
    }>(docIdInput);
    if (!doc.body?.content) return null;

    let fullText = "";
    const segments: { start: number; end: number; len: number }[] = [];
    const collect = (content: DocsContentElement[]): void => {
      for (const element of content) {
        for (const pe of element.paragraph?.elements ?? []) {
          const c = pe.textRun?.content;
          if (c && pe.startIndex !== undefined && pe.endIndex !== undefined) {
            fullText += c;
            segments.push({ start: pe.startIndex, end: pe.endIndex, len: c.length });
          }
        }
        for (const row of element.table?.tableRows ?? []) {
          for (const cell of row.tableCells ?? []) {
            if (cell.content) collect(cell.content);
          }
        }
      }
    };
    collect(doc.body.content);

    let searchStart = 0;
    for (let found = 0; found < instance; ) {
      const hit = fullText.indexOf(textToFind, searchStart);
      if (hit === -1) return null;
      found += 1;
      if (found === instance) {
        const targetStart = hit;
        const targetEnd = hit + textToFind.length;
        let pos = 0;
        let startIndex = -1;
        let endIndex = -1;
        for (const seg of segments) {
          const segStart = pos;
          const segEnd = pos + seg.len;
          if (startIndex === -1 && targetStart >= segStart && targetStart < segEnd) {
            startIndex = seg.start + (targetStart - segStart);
          }
          if (targetEnd > segStart && targetEnd <= segEnd) {
            endIndex = seg.start + (targetEnd - segStart);
            break;
          }
          pos = segEnd;
        }
        if (startIndex === -1 || endIndex === -1) {
          searchStart = hit + 1;
          found -= 1;
          continue;
        }
        return { startIndex, endIndex };
      }
      searchStart = hit + 1;
    }
    return null;
  }

  /**
   * List a document's tabs (flattened, with nesting level).
   *
   * @param docIdInput - Document ID or full Docs URL
   * @returns Array of tabs with `{ tabId, title, level }`
   * @throws If the document is missing or access is denied
   */
  async listTabs(docIdInput: string): Promise<TabWithLevel[]> {
    const doc = await this.request<{ tabs?: DocsTab[] }>(
      `${DOCS_BASE}/documents/${extractGoogleId(docIdInput)}`,
      { query: { includeTabsContent: "false" }, scopes: [GoogleScope.Docs] },
    );
    const out: TabWithLevel[] = [];
    const walk = (tab: DocsTab, level: number): void => {
      out.push({
        tabId: tab.tabProperties?.tabId ?? "",
        title: tab.tabProperties?.title ?? "",
        level,
      });
      for (const child of tab.childTabs ?? []) walk(child, level + 1);
    };
    for (const tab of doc.tabs ?? []) walk(tab, 0);
    return out;
  }

  // --- Comments (Drive v3 sub-resource) ---

  /**
   * List comments on a document, optionally filtering by substring.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param filter - Optional substring; only comments containing it are returned
   * @returns Array of {@link DriveComment}
   * @throws If the document is missing or access is denied
   */
  async listComments(docIdInput: string, filter?: string): Promise<DriveComment[]> {
    const docId = extractGoogleId(docIdInput);
    const payload = await this.request<{ comments?: DriveComment[] }>(
      `${DRIVE_BASE}/files/${docId}/comments`,
      {
        query: {
          fields:
            "comments(id,content,anchor,createdTime,resolved,replies(id,content,createdTime,action))",
          includeDeleted: "false",
        },
        scopes: [GoogleScope.Drive],
      },
    );
    const comments = payload.comments ?? [];
    return filter ? comments.filter((c) => c.content.includes(filter)) : comments;
  }

  /**
   * Get a single comment by ID.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param commentId - Comment ID
   * @returns The {@link DriveComment}
   * @throws If the comment is missing or access is denied
   */
  async getComment(docIdInput: string, commentId: string): Promise<DriveComment> {
    const docId = extractGoogleId(docIdInput);
    return this.request<DriveComment>(`${DRIVE_BASE}/files/${docId}/comments/${commentId}`, {
      query: {
        fields: "id,content,anchor,createdTime,resolved,replies(id,content,createdTime,action)",
      },
      scopes: [GoogleScope.Drive],
    });
  }

  /**
   * Add an anchored comment to a document.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param anchor - Drive anchor JSON string (region the comment refers to)
   * @param content - Comment text
   * @returns The created {@link DriveComment}
   * @throws If the document is missing or access is denied
   */
  async addComment(docIdInput: string, anchor: string, content: string): Promise<DriveComment> {
    const docId = extractGoogleId(docIdInput);
    return this.request<DriveComment>(`${DRIVE_BASE}/files/${docId}/comments`, {
      method: "POST",
      query: { fields: "id,content,anchor,createdTime,resolved" },
      body: { anchor, content },
      scopes: [GoogleScope.Drive],
    });
  }

  /**
   * Reply to an existing comment.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param commentId - Comment ID to reply to
   * @param text - Reply text
   * @returns The created {@link DriveReply}
   * @throws If the comment is missing or access is denied
   */
  async replyToComment(
    docIdInput: string,
    commentId: string,
    text: string,
  ): Promise<DriveReply> {
    const docId = extractGoogleId(docIdInput);
    return this.request<DriveReply>(
      `${DRIVE_BASE}/files/${docId}/comments/${commentId}/replies`,
      {
        method: "POST",
        query: { fields: "id,content,createdTime,action" },
        body: { content: text },
        scopes: [GoogleScope.Drive],
      },
    );
  }

  /**
   * Resolve a comment (posts a `resolve`-action reply).
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param commentId - Comment ID to resolve
   * @returns The created resolving {@link DriveReply}
   * @throws If the comment is missing or access is denied
   */
  async resolveComment(docIdInput: string, commentId: string): Promise<DriveReply> {
    const docId = extractGoogleId(docIdInput);
    return this.request<DriveReply>(
      `${DRIVE_BASE}/files/${docId}/comments/${commentId}/replies`,
      {
        method: "POST",
        query: { fields: "id,content,createdTime,action" },
        body: { action: "resolve", content: "" },
        scopes: [GoogleScope.Drive],
      },
    );
  }

  /**
   * Permanently delete a comment.
   *
   * @param docIdInput - Document ID or full Docs URL
   * @param commentId - Comment ID to delete
   * @throws If the comment is missing or access is denied
   */
  async deleteComment(docIdInput: string, commentId: string): Promise<void> {
    const docId = extractGoogleId(docIdInput);
    await this.request<void>(`${DRIVE_BASE}/files/${docId}/comments/${commentId}`, {
      method: "DELETE",
      scopes: [GoogleScope.Drive],
    });
  }
}

// --- Internal types & request builders (ported from googleDocsApiHelpers.ts) ---

interface DocsContentElement {
  paragraph?: {
    elements?: Array<{
      startIndex?: number;
      endIndex?: number;
      textRun?: { content?: string };
    }>;
  };
  table?: { tableRows?: Array<{ tableCells?: Array<{ content?: DocsContentElement[] }> }> };
}

interface DocsTab {
  tabProperties?: { tabId?: string; title?: string };
  childTabs?: DocsTab[];
}

/** Convert a `#RGB`/`#RRGGBB` hex string to a Docs `RgbColor` (0..1), or null. */
function hexToRgbColor(hex: string): { red: number; green: number; blue: number } | null {
  if (!hex) return null;
  let clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  if (clean.length !== 6) return null;
  const n = Number.parseInt(clean, 16);
  if (Number.isNaN(n)) return null;
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

/** Build an `updateTextStyle` request, or null if no fields were provided. */
function buildUpdateTextStyleRequest(
  startIndex: number,
  endIndex: number,
  style: TextStyleArgs,
): DocsRequest | null {
  const textStyle: Record<string, unknown> = {};
  const fields: string[] = [];
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
  if (style.strikethrough !== undefined) {
    textStyle.strikethrough = style.strikethrough;
    fields.push("strikethrough");
  }
  if (style.fontSize !== undefined) {
    textStyle.fontSize = { magnitude: style.fontSize, unit: "PT" };
    fields.push("fontSize");
  }
  if (style.fontFamily !== undefined) {
    textStyle.weightedFontFamily = { fontFamily: style.fontFamily };
    fields.push("weightedFontFamily");
  }
  if (style.foregroundColor !== undefined) {
    const rgb = hexToRgbColor(style.foregroundColor);
    if (!rgb) throw new Error(`Invalid foreground hex color: ${style.foregroundColor}`);
    textStyle.foregroundColor = { color: { rgbColor: rgb } };
    fields.push("foregroundColor");
  }
  if (style.backgroundColor !== undefined) {
    const rgb = hexToRgbColor(style.backgroundColor);
    if (!rgb) throw new Error(`Invalid background hex color: ${style.backgroundColor}`);
    textStyle.backgroundColor = { color: { rgbColor: rgb } };
    fields.push("backgroundColor");
  }
  if (style.linkUrl !== undefined) {
    textStyle.link = { url: style.linkUrl };
    fields.push("link");
  }
  if (fields.length === 0) return null;
  return {
    updateTextStyle: { range: { startIndex, endIndex }, textStyle, fields: fields.join(",") },
  };
}

/** Build an `updateParagraphStyle` request, or null if no fields were provided. */
function buildUpdateParagraphStyleRequest(
  startIndex: number,
  endIndex: number,
  style: ParagraphStyleArgs,
): DocsRequest | null {
  const paragraphStyle: Record<string, unknown> = {};
  const fields: string[] = [];
  if (style.alignment !== undefined) {
    paragraphStyle.alignment = style.alignment;
    fields.push("alignment");
  }
  if (style.indentStart !== undefined) {
    paragraphStyle.indentStart = { magnitude: style.indentStart, unit: "PT" };
    fields.push("indentStart");
  }
  if (style.indentEnd !== undefined) {
    paragraphStyle.indentEnd = { magnitude: style.indentEnd, unit: "PT" };
    fields.push("indentEnd");
  }
  if (style.spaceAbove !== undefined) {
    paragraphStyle.spaceAbove = { magnitude: style.spaceAbove, unit: "PT" };
    fields.push("spaceAbove");
  }
  if (style.spaceBelow !== undefined) {
    paragraphStyle.spaceBelow = { magnitude: style.spaceBelow, unit: "PT" };
    fields.push("spaceBelow");
  }
  if (style.namedStyleType !== undefined) {
    paragraphStyle.namedStyleType = style.namedStyleType;
    fields.push("namedStyleType");
  }
  if (style.keepWithNext !== undefined) {
    paragraphStyle.keepWithNext = style.keepWithNext;
    fields.push("keepWithNext");
  }
  if (fields.length === 0) return null;
  return {
    updateParagraphStyle: {
      range: { startIndex, endIndex },
      paragraphStyle,
      fields: fields.join(","),
    },
  };
}
