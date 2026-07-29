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
  opts: { bytes: Uint8Array; mimeType: string; hash: string },
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
      return await doclingConvert(doclingUrl, opts.bytes, opts.mimeType);
    } catch (err) {
      console.error("[ocr] docling failed:", err instanceof Error ? err.message : err);
    }
  }
  return null;
}

/** Convert a document to markdown via a docling-serve instance. */
async function doclingConvert(baseUrl: string, bytes: Uint8Array, mimeType: string): Promise<string | null> {
  const form = new FormData();
  form.append("files", new Blob([bytes as unknown as BlobPart], { type: mimeType }), "attachment");
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1alpha/convert/file`, { method: "POST", body: form });
  if (!res.ok) return null;
  const data = (await res.json()) as { document?: { md_content?: string; text_content?: string } };
  return data.document?.md_content ?? data.document?.text_content ?? null;
}
