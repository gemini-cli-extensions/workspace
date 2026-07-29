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
 * Why an attachment is junk (signature images, social/logo icons), or null to
 * keep it. Non-image attachments (PDF, DOCX, ...) and standalone photos are kept.
 */
export function junkReason(a: AttachmentPart): string | null {
  if (!a.mimeType.startsWith("image/")) return null;
  if (a.inline) return "inline embedded image (signature/logo)";
  if (a.contentId) return "embedded image with Content-ID (signature/logo)";
  if (!a.filename) return "inline image with no filename";
  if (LOGO_RE.test(a.filename)) return `logo/social/icon image by filename (${a.filename})`;
  if (a.size > 0 && a.size < TINY_IMAGE_BYTES) return `tiny image (${a.size} bytes) — likely an icon`;
  return null;
}

export function isJunkAttachment(a: AttachmentPart): boolean {
  return junkReason(a) !== null;
}

/** Attachment parts worth capturing (junk removed). */
export function keepableAttachments(payload: any): AttachmentPart[] {
  return extractAttachmentParts(payload).filter((a) => junkReason(a) === null);
}
