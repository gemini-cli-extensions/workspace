/**
 * @file docs/schema.ts
 * @description Serves the Google API request grammar so agents author against a
 * real schema instead of guessing. Two layers:
 *   - the full Discovery doc per surface (fetched + KV-cached), the source of truth
 *   - curated "recipes": small, correct request patterns for the moves that make
 *     professional output (styled header, landscape section, keep-with-next…).
 */

export type SchemaSurface = "docs" | "slides" | "sheets" | "forms";

const DISCOVERY_URLS: Record<SchemaSurface, string> = {
  docs: "https://docs.googleapis.com/$discovery/rest?version=v1",
  slides: "https://slides.googleapis.com/$discovery/rest?version=v1",
  sheets: "https://sheets.googleapis.com/$discovery/rest?version=v4",
  forms: "https://forms.googleapis.com/$discovery/rest?version=v1",
};

const DISCOVERY_TTL = 60 * 60 * 24 * 7; // 7 days

export function isSchemaSurface(s: string): s is SchemaSurface {
  return s === "docs" || s === "slides" || s === "sheets" || s === "forms";
}

/** Fetch + KV-cache a surface's Discovery document. */
export async function getDiscovery(env: Env, surface: SchemaSurface): Promise<unknown | null> {
  const key = `discovery:${surface}`;
  const cached = await env.SESSIONS.get(key);
  if (cached) return JSON.parse(cached);
  const res = await fetch(DISCOVERY_URLS[surface]);
  if (!res.ok) return null;
  const body = await res.text();
  await env.SESSIONS.put(key, body, { expirationTtl: DISCOVERY_TTL });
  return JSON.parse(body);
}

/** The batchUpdate request-type names for a surface, pulled from Discovery. */
export async function getRequestTypes(env: Env, surface: SchemaSurface): Promise<string[]> {
  const disc = (await getDiscovery(env, surface)) as any;
  const schemas = disc?.schemas ?? {};
  const reqSchemaName = surface === "sheets" ? "Request" : "Request";
  const props = schemas[reqSchemaName]?.properties ?? {};
  return Object.keys(props).sort();
}

export interface Recipe {
  name: string;
  description: string;
  note?: string;
  requests: unknown[];
}

const IDX = "<INDEX — get real positions via docs_get_json, or use the factory tools>";

/** Curated, correct request patterns. Indices are illustrative — see IDX note. */
export const RECIPES: Record<SchemaSurface, Recipe[]> = {
  docs: [
    {
      name: "keep-heading-with-body",
      description: "Prevent an orphaned heading at a page bottom.",
      requests: [{ updateParagraphStyle: { range: { startIndex: IDX, endIndex: IDX }, paragraphStyle: { keepWithNext: true }, fields: "keepWithNext" } }],
    },
    {
      name: "landscape-section",
      description: "Make one section landscape (e.g. for a wide table). Insert the two breaks high-index-first.",
      note: "flipPageOrientation lives on SectionStyle; SectionStyle has NO pageSize — do not set it.",
      requests: [
        { insertSectionBreak: { sectionType: "NEXT_PAGE", location: { index: IDX } } },
        { insertSectionBreak: { sectionType: "NEXT_PAGE", location: { index: IDX } } },
        { updateSectionStyle: { range: { startIndex: IDX }, sectionStyle: { flipPageOrientation: true }, fields: "flipPageOrientation" } },
      ],
    },
    {
      name: "styled-table-header",
      description: "Dark-blue header fill, white bold centered text, 1pt borders. (Or just call table_factory.)",
      requests: [
        { updateTableCellStyle: { tableRange: { tableCellLocation: { tableStartLocation: { index: IDX }, rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: "<COLS>" }, tableCellStyle: { backgroundColor: { color: { rgbColor: { red: 0.12, green: 0.31, blue: 0.47 } } }, contentAlignment: "MIDDLE" }, fields: "backgroundColor,contentAlignment" } },
        { updateTextStyle: { range: { startIndex: IDX, endIndex: IDX }, textStyle: { bold: true, foregroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } } }, fields: "bold,foregroundColor" } },
      ],
    },
    {
      name: "add-tab",
      description: "Create a named tab with an emoji at an index (ordering).",
      requests: [{ addDocumentTab: { tabProperties: { title: "Sources", index: 1, iconEmoji: "📚" } } }],
    },
    {
      name: "delete-phantom-paragraph",
      description: "Remove a stranded empty paragraph that renders a blank page after a section break.",
      requests: [{ deleteContentRange: { range: { startIndex: IDX, endIndex: IDX } } }],
    },
  ],
  slides: [
    {
      name: "create-slide",
      description: "Add a slide with a layout.",
      requests: [{ createSlide: { slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" } } }],
    },
  ],
  sheets: [
    {
      name: "banded-range",
      description: "Apply alternating row banding (table styling without per-cell formats).",
      requests: [{ addBanding: { bandedRange: { range: { sheetId: 0, startRowIndex: 0, startColumnIndex: 0 }, rowProperties: { headerColor: { red: 0.12, green: 0.31, blue: 0.47 } } } } }],
    },
  ],
  forms: [],
};
