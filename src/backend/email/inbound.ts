/**
 * @fileoverview Cloudflare Email Routing — inbound `email()` handler.
 *
 * THE FLOW (end-to-end Email Routing demo):
 *
 *   1. A sender emails an address on a domain you onboarded to Cloudflare Email
 *      Routing (e.g. `demo@yourdomain.com`).
 *   2. Cloudflare matches a **Routing Rule** that targets THIS Worker (the rule
 *      is configured in the Cloudflare dashboard / via `wrangler email routing`,
 *      NOT in code — receiving needs no wrangler binding).
 *   3. Cloudflare invokes the Worker's exported `email(message, env, ctx)`
 *      function with a `ForwardableEmailMessage`.
 *   4. We buffer the raw MIME stream ONCE, do a minimal header + text-body
 *      extraction, compute a snippet, and INSERT a row into the `email_messages`
 *      D1 table (folder "inbox", unread) via Drizzle.
 *   5. Optionally we `message.forward()` a copy to a verified destination
 *      (configured via the `INBOX_FORWARD_TO` var) so mail still reaches a human.
 *   6. The two-pane inbox UI (`/inbox`) lists those rows from `GET /api/inbox`.
 *
 * Why minimal MIME parsing instead of `postal-mime`? A parallel agent owns
 * `package.json`, so we cannot add the npm dependency. The built-in extraction
 * below handles the common single-part / multipart-with-text cases well enough
 * for the showcase; swap in `postal-mime` later for full fidelity (attachments,
 * nested multiparts, quoted-printable/base64 transfer encodings).
 *
 * GOTCHA: `message.raw` is a single-use `ReadableStream`. We buffer it to an
 * ArrayBuffer first; reading it twice yields an empty stream.
 */

import { getDb } from "../db";
import { emailMessages } from "../db/schema";

/** Max characters kept for the list-pane snippet. */
const SNIPPET_LENGTH = 140;

/**
 * The subset of `ForwardableEmailMessage` we rely on. Declared locally so this
 * module type-checks even before `wrangler types` regenerates the global types,
 * and so the handler has no hard dependency on the exact generated shape.
 */
interface InboundEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
}

/** A "Display Name <addr@host>" header value split into its parts. */
interface ParsedAddress {
  name: string | null;
  address: string;
}

/**
 * Parse an RFC 5322 address header value such as `"Jane Doe" <jane@x.com>` or
 * `jane@x.com` into a display name + bare address. Falls back gracefully.
 */
export function parseAddressHeader(value: string | null, fallbackAddress: string): ParsedAddress {
  if (!value) return { name: null, address: fallbackAddress };
  const angle = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (angle) {
    const rawName = angle[1]?.replace(/^"|"$/g, "").trim() ?? "";
    return { name: rawName || null, address: (angle[2] ?? fallbackAddress).trim() };
  }
  return { name: null, address: value.trim() || fallbackAddress };
}

/**
 * Minimal MIME extraction: split headers from the body on the first blank line,
 * and if the message is `multipart/*`, pull the first `text/plain` part (or, as
 * a fallback, the first `text/html` part). Good enough for the showcase; does
 * NOT decode quoted-printable/base64 or handle attachments.
 */
export function extractBodies(raw: string): { text: string; html: string | null } {
  const headerBodySplit = raw.search(/\r?\n\r?\n/);
  const headerBlock = headerBodySplit === -1 ? raw : raw.slice(0, headerBodySplit);
  const body = headerBodySplit === -1 ? "" : raw.slice(headerBodySplit).replace(/^\r?\n\r?\n/, "");

  const contentType = (headerBlock.match(/^content-type:\s*(.+)$/im)?.[1] ?? "").toLowerCase();
  const boundaryMatch = headerBlock.match(/boundary="?([^";\r\n]+)"?/i);

  // Single-part text/* — the body IS the content.
  if (!contentType.startsWith("multipart/") || !boundaryMatch) {
    if (contentType.startsWith("text/html")) return { text: htmlToText(body), html: body };
    return { text: body.trim(), html: null };
  }

  // Multipart — scan parts for the best text representation.
  const boundary = boundaryMatch[1]!;
  const parts = body.split(new RegExp(`--${escapeRegExp(boundary)}(?:--)?\\r?\\n?`));
  let text: string | null = null;
  let html: string | null = null;
  for (const part of parts) {
    const split = part.search(/\r?\n\r?\n/);
    if (split === -1) continue;
    const partHeaders = part.slice(0, split).toLowerCase();
    const partBody = part.slice(split).replace(/^\r?\n\r?\n/, "").trim();
    if (!partBody) continue;
    if (partHeaders.includes("text/plain") && text === null) text = partBody;
    else if (partHeaders.includes("text/html") && html === null) html = partBody;
  }
  const resolvedText = text ?? (html ? htmlToText(html) : "");
  return { text: resolvedText.trim(), html };
}

/** Strip tags from an HTML fragment for a readable plain-text fallback. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** First ~140 chars of the body, whitespace-collapsed, for the list pane. */
export function buildSnippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_LENGTH ? `${flat.slice(0, SNIPPET_LENGTH - 1)}…` : flat;
}

/**
 * Cloudflare Email Routing inbound handler.
 *
 * Wired into both `createExports()` (the object the `@astrojs/cloudflare`
 * adapter re-exports) and the standalone default export in `src/_worker.ts`.
 * Cloudflare calls this when a routing rule targets the Worker.
 *
 * @param message Incoming email (`ForwardableEmailMessage`).
 * @param env     Worker bindings (D1 `DB`, optional `INBOX_FORWARD_TO` var).
 * @param ctx     Execution context (for `waitUntil` if deferring work).
 */
export async function handleInboundEmail(
  message: InboundEmailMessage,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  // 1. Buffer the single-use raw stream ONCE.
  const rawText = await new Response(message.raw as unknown as BodyInit).text();

  // 2. Parse envelope + headers. `message.from`/`message.to` are the trusted
  //    SMTP envelope addresses; the From: header gives us a display name.
  const subject = message.headers.get("subject")?.trim() || "(no subject)";
  const fromHeader = parseAddressHeader(message.headers.get("from"), message.from);

  // 3. Extract a text/html body + snippet.
  const { text, html } = extractBodies(rawText);
  const snippet = buildSnippet(text || html || "");

  // 4. Persist as an unread inbox row.
  const db = getDb(env);
  await db.insert(emailMessages).values({
    fromAddress: message.from,
    fromName: fromHeader.name,
    toAddress: message.to,
    subject,
    textBody: text,
    htmlBody: html,
    snippet,
    folder: "inbox",
    read: false,
    starred: false,
    receivedAt: new Date(),
    rawSize: message.rawSize ?? rawText.length,
  });

  // 5. Optionally forward a copy to a verified destination so mail still
  //    reaches a human. The destination MUST be verified in the dashboard /
  //    via `wrangler email routing addresses create`, else this no-ops/throws.
  const forwardTo = (env as unknown as { INBOX_FORWARD_TO?: string }).INBOX_FORWARD_TO;
  if (forwardTo) {
    try {
      await message.forward(forwardTo);
    } catch (err) {
      // Never let a forwarding failure drop the stored row — log and continue.
      console.error("[inbound-email] forward failed:", err);
    }
  }
}
