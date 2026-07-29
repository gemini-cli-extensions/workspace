/**
 * @file gmail/attachment-store.ts
 * @description Persist a Gmail attachment's bytes to R2 or Drive per the label's
 * config. Drive uploads land in a dedicated folder on the highest-free-storage
 * account (see drive-target). Returns the refs (+ content hash) for the
 * gmail_message_attachments row.
 *
 * The `md5` column holds a real MD5 (js-md5, pure JS — Workers' SubtleCrypto has
 * no MD5), used for dedup (skip re-OCR of identical bytes).
 */
import { md5 } from "js-md5";

import { DriveService } from "@/backend/mcp/services/drive";

import type { AttachmentPart } from "./attachments";
import { resolveDriveTarget } from "./drive-target";

/** Decode a Gmail base64url attachment payload to bytes. */
export function decodeAttachment(data: string): Uint8Array {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** MD5 hex of attachment bytes (dedup key). */
export function hashBytes(bytes: Uint8Array): string {
  return md5(bytes);
}

function safeName(s: string): string {
  return (s || "file").replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

export interface StoredRefs {
  r2Key: string | null;
  driveId: string | null;
  driveUrl: string | null;
}

/** Store attachment bytes to R2 (or Drive per label) and return the refs. */
export async function storeAttachment(
  env: Env,
  opts: { account: string; messageId: string; part: AttachmentPart; bytes: Uint8Array; store: string | null },
): Promise<StoredRefs> {
  const name = safeName(opts.part.filename || opts.part.attachmentId);

  // Drive: upload into the dedicated folder on the highest-storage account.
  if (opts.store === "drive") {
    const target = await resolveDriveTarget(env);
    if (target) {
      const file = await new DriveService(env, target.ref).uploadBinary(name, opts.part.mimeType, opts.bytes, target.folderId);
      return { r2Key: null, driveId: file.id, driveUrl: file.webViewLink ?? null };
    }
    // No usable Drive account → fall through to R2.
  }

  const key = `gmail/${opts.account}/${opts.messageId}/${name}`;
  await env.R2_FILES_BUCKET.put(key, opts.bytes, { httpMetadata: { contentType: opts.part.mimeType } });
  return { r2Key: key, driveId: null, driveUrl: null };
}
