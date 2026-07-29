/**
 * @file docs/render-qc.ts
 * @description Render-level QC. Structural QC (qc.ts) reads the AST; this reads
 * the *rendered* pagination by exporting to PDF and inspecting per-page text —
 * catching things the AST can't, like a heading stranded at a page bottom.
 * Works for any surface that exports to PDF (Docs, Sheets, Slides).
 */
import { extractText, getDocumentProxy } from "unpdf";

import { docBodyContent } from "./locate";

export interface RenderFinding {
  rule: string;
  severity: "info" | "warn" | "crit";
  detail: string;
  page?: number;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Extract heading paragraph texts from a raw Docs document (for orphan matching). */
export function collectHeadings(rawDoc: any, tabId?: string): string[] {
  const out: string[] = [];
  for (const el of docBodyContent(rawDoc, tabId)) {
    const named = el?.paragraph?.paragraphStyle?.namedStyleType;
    if (typeof named === "string" && named.startsWith("HEADING")) {
      const text = (el.paragraph.elements ?? []).map((e: any) => e?.textRun?.content ?? "").join("").trim();
      if (text) out.push(text);
    }
  }
  return out;
}

/** Flag headings that render as the last line of a page (orphaned from their section). */
export function analyzePages(pages: string[], headingTexts: string[]): RenderFinding[] {
  const headings = new Set(headingTexts.map(norm).filter(Boolean));
  const findings: RenderFinding[] = [];
  pages.forEach((page, i) => {
    if (i === pages.length - 1) return; // last page can't orphan onto a next page
    const lines = page.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return;
    const last = lines[lines.length - 1];
    if (headings.has(norm(last))) {
      findings.push({
        rule: "orphan-heading",
        severity: "warn",
        detail: `Heading "${last}" is the last line of page ${i + 1} — its section starts on the next page. Add keepWithNext (docs_qc_fix) or a page break.`,
        page: i + 1,
      });
    }
  });
  return findings;
}

/** Per-page text of a PDF (bytes). */
export async function pdfToPages(bytes: Uint8Array): Promise<string[]> {
  const doc = await getDocumentProxy(bytes);
  const { text } = await extractText(doc, { mergePages: false });
  return Array.isArray(text) ? text : [String(text)];
}
