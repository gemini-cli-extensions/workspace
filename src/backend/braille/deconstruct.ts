/**
 * @file braille/deconstruct.ts
 * @description Pure functions that turn raw Google document JSON into
 * "braille" fragments — one whole-document `template` plus zero or more
 * extracted `component`s. No network, no DB: feed it the raw `documents.get`
 * / `presentations.get` / `spreadsheets.get` response, get back fragments to
 * store. Kept side-effect-free so it is trivially unit-testable.
 */

export type BrailleSurface = "doc" | "slide" | "sheet";

export interface BrailleFragment {
  kind: "template" | "component";
  surface: BrailleSurface;
  /** Component name / identifier ("template" for the whole-file fragment). */
  name: string;
  /** Anchor within the source (component name, slide/tab id) or null. */
  anchor: string | null;
  /** The raw JSON chunk — batchUpdate-replayable braille. */
  structure: unknown;
}

const GOOGLE_MIME_SURFACE: Record<string, BrailleSurface> = {
  "application/vnd.google-apps.document": "doc",
  "application/vnd.google-apps.presentation": "slide",
  "application/vnd.google-apps.spreadsheet": "sheet",
};

/** Map a Drive mimeType to a braille surface, or null if unsupported. */
export function detectSurface(mimeType: string): BrailleSurface | null {
  return GOOGLE_MIME_SURFACE[mimeType] ?? null;
}

// ---------------------------------------------------------------------------
// Docs
// ---------------------------------------------------------------------------

/**
 * Collect body content across all tabs (when fetched with
 * `includeTabsContent=true`) or the legacy root `body` (single-tab reads).
 */
function docContent(raw: any): any[] {
  if (Array.isArray(raw?.tabs) && raw.tabs.length) {
    const out: any[] = [];
    for (const tab of raw.tabs) {
      const content = tab?.documentTab?.body?.content;
      if (Array.isArray(content)) out.push(...content);
    }
    return out;
  }
  return Array.isArray(raw?.body?.content) ? raw.body.content : [];
}

/** Concatenate the text of a structural paragraph element. */
function paragraphText(element: any): string {
  const els = element?.paragraph?.elements;
  if (!Array.isArray(els)) return "";
  return els.map((e: any) => e?.textRun?.content ?? "").join("");
}

const COMPONENT_START = /\[Component:\s*(.*?)\]/;
const COMPONENT_END = /\[End Component\]/;

function deconstructDoc(raw: unknown): BrailleFragment[] {
  const fragments: BrailleFragment[] = [
    { kind: "template", surface: "doc", name: "template", anchor: null, structure: raw },
  ];

  const content = docContent(raw);
  let current: { name: string; els: any[] } | null = null;
  let foundAnchor = false;

  for (const el of content) {
    const text = paragraphText(el);
    const start = text.match(COMPONENT_START);
    if (start) {
      foundAnchor = true;
      current = { name: start[1].trim(), els: [] };
      continue;
    }
    if (COMPONENT_END.test(text)) {
      if (current) {
        fragments.push({
          kind: "component",
          surface: "doc",
          name: current.name,
          anchor: current.name,
          structure: { content: current.els },
        });
        current = null;
      }
      continue;
    }
    if (current) current.els.push(el);
  }

  // Fallback: no explicit anchors → treat each table as a reusable component.
  if (!foundAnchor) {
    let i = 0;
    for (const el of content) {
      if (el?.table) {
        fragments.push({
          kind: "component",
          surface: "doc",
          name: `table-${i}`,
          anchor: null,
          structure: el,
        });
        i++;
      }
    }
  }

  return fragments;
}

// ---------------------------------------------------------------------------
// Slides — one component per slide
// ---------------------------------------------------------------------------

function deconstructSlides(raw: unknown): BrailleFragment[] {
  const fragments: BrailleFragment[] = [
    { kind: "template", surface: "slide", name: "template", anchor: null, structure: raw },
  ];
  const slides = Array.isArray((raw as any)?.slides) ? (raw as any).slides : [];
  slides.forEach((slide: any, i: number) => {
    const id = slide?.objectId ?? `slide-${i}`;
    fragments.push({ kind: "component", surface: "slide", name: id, anchor: id, structure: slide });
  });
  return fragments;
}

// ---------------------------------------------------------------------------
// Sheets — one component per tab
// ---------------------------------------------------------------------------

function deconstructSheets(raw: unknown): BrailleFragment[] {
  const fragments: BrailleFragment[] = [
    { kind: "template", surface: "sheet", name: "template", anchor: null, structure: raw },
  ];
  const sheets = Array.isArray((raw as any)?.sheets) ? (raw as any).sheets : [];
  sheets.forEach((sheet: any, i: number) => {
    const title = sheet?.properties?.title ?? `sheet-${i}`;
    fragments.push({ kind: "component", surface: "sheet", name: title, anchor: title, structure: sheet });
  });
  return fragments;
}

/** Deconstruct raw Google document JSON for the given surface into braille. */
export function deconstruct(surface: BrailleSurface, raw: unknown): BrailleFragment[] {
  switch (surface) {
    case "doc":
      return deconstructDoc(raw);
    case "slide":
      return deconstructSlides(raw);
    case "sheet":
      return deconstructSheets(raw);
  }
}
