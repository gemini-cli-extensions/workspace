/**
 * @file docs/html-to-braille.ts
 * @description Pure HTML → Google Docs batchUpdate requests. The controllable
 * alternative to Google's HTML importer: WE map the block model, so headings,
 * inline styles, and lists come out clean (no <hr>-around-heading junk).
 *
 * Strategy: accumulate the full plain text first, then style by resolved
 * ranges. One insertText + range styling — never multiple inserts, so no
 * index-shift math. Tables/images are out of scope for v1 (use table_factory).
 */
import { parse, type HTMLElement, type Node } from "node-html-parser";

type DocsRequest = Record<string, unknown>;

interface InlineRange {
  start: number;
  end: number;
  style: { bold?: boolean; italic?: boolean; underline?: boolean; mono?: boolean };
}

const HEADING: Record<string, string> = { h1: "HEADING_1", h2: "HEADING_2", h3: "HEADING_3", h4: "HEADING_4", h5: "HEADING_5", h6: "HEADING_6" };

/** Collect a block element's plain text + inline style ranges (offsets within the block). */
function inlineWalk(node: Node, active: InlineRange["style"], acc: { text: string; ranges: InlineRange[] }): void {
  // Text node
  if ((node as any).nodeType === 3 || typeof (node as any).rawText === "string" && !(node as any).tagName) {
    const t = (node as any).rawText ?? (node as any).text ?? "";
    const clean = t.replace(/\s+/g, " ");
    if (!clean) return;
    const start = acc.text.length;
    acc.text += clean;
    if (active.bold || active.italic || active.underline || active.mono) {
      acc.ranges.push({ start, end: acc.text.length, style: { ...active } });
    }
    return;
  }
  const el = node as HTMLElement;
  const tag = (el.tagName ?? "").toLowerCase();
  const next = { ...active };
  if (tag === "b" || tag === "strong") next.bold = true;
  if (tag === "i" || tag === "em") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "code") next.mono = true;
  for (const child of el.childNodes) inlineWalk(child, next, acc);
}

const colorMono = { weightedFontFamily: { fontFamily: "Courier New" } };

/** Convert an HTML string to Docs batchUpdate requests inserting at `baseIndex`. */
export function htmlToRequests(html: string, baseIndex = 1, tabId?: string): DocsRequest[] {
  const root = parse(html);
  let text = "";
  const paraRanges: { start: number; end: number; named?: string }[] = [];
  const bulletRanges: { start: number; end: number; ordered: boolean }[] = [];
  const textRanges: { start: number; end: number; style: InlineRange["style"] }[] = [];

  const emitBlock = (el: HTMLElement, named?: string, bullet?: { ordered: boolean }) => {
    const acc = { text: "", ranges: [] as InlineRange[] };
    for (const child of el.childNodes) inlineWalk(child, {}, acc);
    const blockText = acc.text.trim();
    if (!blockText) return;
    const start = baseIndex + text.length;
    text += blockText + "\n";
    const end = baseIndex + text.length; // includes the newline
    paraRanges.push({ start, end, named });
    if (bullet) bulletRanges.push({ start, end, ordered: bullet.ordered });
    for (const r of acc.ranges) textRanges.push({ start: start + r.start, end: start + r.end, style: r.style });
  };

  const walkBlocks = (el: HTMLElement) => {
    for (const child of el.childNodes) {
      const c = child as HTMLElement;
      const tag = (c.tagName ?? "").toLowerCase();
      if (HEADING[tag]) emitBlock(c, HEADING[tag]);
      else if (tag === "p") emitBlock(c);
      else if (tag === "li") emitBlock(c, undefined, { ordered: (c.parentNode as any)?.tagName?.toLowerCase() === "ol" });
      else if (tag === "ul" || tag === "ol" || tag === "div" || tag === "body" || tag === "html" || tag === "article" || tag === "section") walkBlocks(c);
      else if (tag === "pre") emitBlock(c);
      else if (c.childNodes?.length) walkBlocks(c);
    }
  };
  walkBlocks(root);

  if (!text) return [];

  const range = (s: number, e: number) => (tabId ? { startIndex: s, endIndex: e, tabId } : { startIndex: s, endIndex: e });
  const requests: DocsRequest[] = [{ insertText: { location: tabId ? { index: baseIndex, tabId } : { index: baseIndex }, text } }];

  for (const p of paraRanges) {
    if (p.named) {
      requests.push({ updateParagraphStyle: { range: range(p.start, p.end), paragraphStyle: { namedStyleType: p.named }, fields: "namedStyleType" } });
    }
  }
  for (const b of bulletRanges) {
    requests.push({
      createParagraphBullets: {
        range: range(b.start, b.end),
        bulletPreset: b.ordered ? "NUMBERED_DECIMAL_ALPHA_ROMAN" : "BULLET_DISC_CIRCLE_SQUARE",
      },
    });
  }
  for (const t of textRanges) {
    const style: Record<string, unknown> = {};
    const fields: string[] = [];
    if (t.style.bold) { style.bold = true; fields.push("bold"); }
    if (t.style.italic) { style.italic = true; fields.push("italic"); }
    if (t.style.underline) { style.underline = true; fields.push("underline"); }
    if (t.style.mono) { Object.assign(style, colorMono); fields.push("weightedFontFamily"); }
    if (fields.length) requests.push({ updateTextStyle: { range: range(t.start, t.end), textStyle: style, fields: fields.join(",") } });
  }
  return requests;
}
