/**
 * @file gmail/ocr-service.ts
 * @description Extract text from an attachment. PDFs are parsed in-worker with
 * unpdf; images/scanned docs go to an optional docling-serve instance
 * (DOCLING_URL). Deduplicated by content hash — if identical bytes were already
 * OCR'd (same md5 with ocr_text), that text is reused instead of re-running.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";

import { getDb } from "@/db";
import { gmailMessageAttachments } from "@db/schemas";

/** Reuse prior OCR for identical bytes (hash), else extract. Returns null if unavailable. */
export async function ocrAttachment(
  env: Env,
  opts: { bytes: Uint8Array; mimeType: string; hash: string; filename?: string },
): Promise<string | null> {
  // Dedup: identical content already OCR'd?
  const db = getDb(env);
  const prior = await db
    .select({ ocrText: gmailMessageAttachments.ocrText })
    .from(gmailMessageAttachments)
    .where(and(eq(gmailMessageAttachments.md5, opts.hash), isNotNull(gmailMessageAttachments.ocrText)))
    .limit(1);
  if (prior[0]?.ocrText) return prior[0].ocrText;

  const isPdf = opts.mimeType === "application/pdf" || opts.mimeType.includes("pdf");
  if (isPdf) {
    try {
      const pdf = await getDocumentProxy(opts.bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      const joined = Array.isArray(text) ? text.join("\n") : text;
      return joined?.trim() ? joined : null;
    } catch (err) {
      console.error("[ocr] unpdf failed:", err instanceof Error ? err.message : err);
      // fall through to docling if configured (scanned PDF with no text layer)
    }
  }

  const doclingUrl = env.DOCLING_URL?.trim();
  if (doclingUrl && (isPdf || opts.mimeType.startsWith("image/"))) {
    try {
      return await doclingConvert(doclingUrl, opts.bytes, opts.filename ?? "attachment");
    } catch (err) {
      console.error("[ocr] docling failed:", err instanceof Error ? err.message : err);
    }
  }
  return null;
}

/**
 * Convert a document to markdown via a docling-serve instance (docling-sdk).
 * Imported lazily so the SDK (and its Node-built-in baggage) never loads unless
 * DOCLING_URL is configured and an image/scanned doc is actually processed.
 */
async function doclingConvert(baseUrl: string, bytes: Uint8Array, filename: string): Promise<string | null> {
  const { createAPIClient } = await import("docling-sdk/browser");
  const client = createAPIClient(baseUrl, { timeout: 30000, retries: 2 });
  const result = await client.convert(bytes, filename, { to_formats: ["md"] });
  return result.document?.md_content ?? null;
}
