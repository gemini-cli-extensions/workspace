/**
 * @file gmail/attachments.ts
 * @description Pure attachment extraction + junk filtering. Walks a raw Gmail
 * payload for attachment parts, and decides which are worth keeping — dropping
 * the inline signature images and social/logo icons that clutter most email.
 * No network. Testable.
 */

export interface AttachmentPart {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Inline (embedded in the body) vs a real attachment. */
  inline: boolean;
  contentId: string | null;
}

function headerVal(headers: any[], name: string): string | null {
  return headers?.find((h) => h?.name?.toLowerCase() === name)?.value ?? null;
}

/** Collect every attachment part in the MIME tree. */
export function extractAttachmentParts(payload: any): AttachmentPart[] {
  const out: AttachmentPart[] = [];
  const walk = (p: any) => {
    if (!p) return;
    if (p.body?.attachmentId) {
      const headers = p.headers ?? [];
      const cd = headerVal(headers, "content-disposition") ?? "";
      const cid = headerVal(headers, "content-id");
      out.push({
        attachmentId: p.body.attachmentId,
        filename: p.filename ?? "",
        mimeType: p.mimeType ?? "application/octet-stream",
        size: p.body.size ?? 0,
        inline: /inline/i.test(cd) || !!cid,
        contentId: cid ? cid.replace(/^<|>$/g, "") : null,
      });
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(payload);
  return out;
}

const LOGO_RE = /(logo|signature|sig[-_]?image|icon|image0\d\d|facebook|instagram|twitter|linkedin|social|banner|footer)/i;
const TINY_IMAGE_BYTES = 20_000;

/**
 * Signature images and social/logo icons are junk; real documents and standalone
 * photos are kept. Non-image attachments (PDF, DOCX, ...) are always kept.
 */
export function isJunkAttachment(a: AttachmentPart): boolean {
  if (!a.mimeType.startsWith("image/")) return false;
  if (a.inline) return true; // embedded body image = signature/logo
  if (a.contentId) return true;
  if (!a.filename) return true;
  if (LOGO_RE.test(a.filename)) return true;
  if (a.size > 0 && a.size < TINY_IMAGE_BYTES) return true; // tiny image = icon
  return false;
}

/** Attachment parts worth capturing (junk removed). */
export function keepableAttachments(payload: any): AttachmentPart[] {
  return extractAttachmentParts(payload).filter((a) => !isJunkAttachment(a));
}
